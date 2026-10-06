begin;

create or replace function public.reschedule_client_booking(
  p_client_id uuid,
  p_booking_id uuid,
  p_date date,
  p_time text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  availability jsonb;
begin
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if booking.status not in ('requested', 'accepted') then
    return jsonb_build_object('result', 'not_allowed');
  end if;

  availability := private.professional_availability_api(
    booking.professional_id, p_date, booking.service_id::text, booking.id::text
  );
  if not coalesce(availability -> 'slots', '[]'::jsonb) ? p_time then
    return jsonb_build_object('result', 'slot_unavailable');
  end if;

  update public.bookings set
    scheduled_start = private.booking_scheduled_start(p_date, p_time),
    version = version + 1,
    updated_at = p_occurred_at
  where id = booking.id and version = booking.version;
  if not found then return jsonb_build_object('result', 'not_allowed'); end if;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'BookingRescheduled', 1, 'booking', booking.id::text, booking.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    jsonb_build_object(
      'clientId', p_client_id,
      'professionalId', booking.professional_id,
      'dateIso', p_date::text,
      'time', p_time
    )
  );

  return jsonb_build_object(
    'result', 'updated',
    'booking', private.booking_api(booking.id)
  );
end;
$$;

create or replace function public.cancel_client_booking(
  p_client_id uuid,
  p_booking_id uuid,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  payment public.payment_intents%rowtype;
  v_cancellation_policy text;
  professional_amount numeric(12, 2);
  refund_amount numeric(12, 2);
begin
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id
  for update;
  if not found then return 'not_found'; end if;
  if booking.status = 'cancelled' then return 'cancelled'; end if;
  if booking.status not in ('requested', 'accepted', 'on_the_way') then
    return 'not_allowed';
  end if;

  v_cancellation_policy := case when booking.status = 'on_the_way'
    then 'travel_fee_forfeit' else 'full_refund' end;
  professional_amount := case when booking.status = 'on_the_way'
    then booking.travel_fee else 0 end;

  select * into payment from public.payment_intents
  where booking_id = booking.id
  for update;
  if payment.status = 'cash_collected' then
    raise exception 'collected cash cannot be refunded automatically';
  end if;

  update public.bookings set
    status = 'cancelled',
    cancelled_by = 'client',
    cancellation_policy = v_cancellation_policy,
    cancellation_reason = 'client_cancelled',
    cancelled_at = p_occurred_at,
    version = version + 1,
    updated_at = p_occurred_at
  where id = booking.id and version = booking.version;
  if not found then return 'not_allowed'; end if;

  if payment.id is not null and payment.status <> 'refunded' then
    refund_amount := greatest(0, payment.amount - professional_amount);
    if payment.status = 'captured' then
      insert into public.ledger_entries (
        booking_id, payment_intent_id, entry_group, account, amount, created_at
      ) values
        (booking.id, payment.id, 'cancellation:' || v_cancellation_policy || ':' || payment.id, 'provider_clearing', -refund_amount, p_occurred_at),
        (booking.id, payment.id, 'cancellation:' || v_cancellation_policy || ':' || payment.id, 'escrow_liability', payment.amount, p_occurred_at),
        (booking.id, payment.id, 'cancellation:' || v_cancellation_policy || ':' || payment.id, 'professional_payable', -professional_amount, p_occurred_at),
        (booking.id, payment.id, 'cancellation:' || v_cancellation_policy || ':' || payment.id, 'platform_commission', 0, p_occurred_at)
      on conflict (entry_group, account) do nothing;

      if professional_amount > 0 then
        insert into public.professional_earnings (
          professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at
        ) values (
          booking.professional_id, booking.id, professional_amount, 0,
          professional_amount, p_occurred_at
        ) on conflict (booking_id) do nothing;
      end if;
    end if;

    if payment.status = 'cash_due' and professional_amount > 0 then
      update public.payment_intents set
        amount = professional_amount, version = version + 1, updated_at = p_occurred_at
      where id = payment.id and version = payment.version;
    else
      update public.payment_intents set
        status = 'refunded',
        refunded_amount = case when payment.status = 'captured' then refund_amount else 0 end,
        version = version + 1,
        updated_at = p_occurred_at
      where id = payment.id and version = payment.version;

      insert into public.domain_event_outbox (
        event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
        occurred_at, correlation_id, causation_id, payload
      ) values (
        'PaymentRefunded', 1, 'payment', payment.id::text, payment.version + 1,
        p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
        'booking:' || booking.id::text || ':cancelled',
        jsonb_build_object(
          'clientId', payment.client_id,
          'bookingId', booking.id,
          'paymentIntentId', payment.id,
          'provider', payment.provider::text,
          'reason', 'booking_cancellation',
          'refundedAmount', case when payment.status = 'captured' then refund_amount else 0 end
        )
      );
    end if;
  end if;

  insert into public.booking_status_events (booking_id, status, changed_by, note, created_at)
  values (booking.id, 'cancelled', p_client_id, 'client cancellation', p_occurred_at);

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'BookingCancelled', 1, 'booking', booking.id::text, booking.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    jsonb_build_object(
      'clientId', p_client_id,
      'professionalId', booking.professional_id,
      'cancelledBy', 'client',
      'cancellationPolicy', v_cancellation_policy
    )
  );

  return 'cancelled';
end;
$$;

create or replace function public.submit_client_booking_review(
  p_client_id uuid,
  p_booking_id uuid,
  p_review_id uuid,
  p_technique_rating smallint,
  p_professionalism_rating smallint,
  p_tags text[],
  p_review_text text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  v_average_rating numeric(3, 2);
  v_review_count integer;
  quality_flag_id uuid;
begin
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if booking.status <> 'completed' then
    return jsonb_build_object('result', 'not_completed');
  end if;
  if exists (select 1 from public.reviews where booking_id = booking.id) then
    return jsonb_build_object('result', 'already_reviewed');
  end if;

  insert into public.reviews (
    id, booking_id, client_id, professional_id, technique_rating,
    professionalism_rating, tags, review_text, moderation_status,
    created_at, updated_at
  ) values (
    p_review_id, booking.id, p_client_id, booking.professional_id,
    p_technique_rating, p_professionalism_rating, p_tags, p_review_text,
    'published', p_occurred_at, p_occurred_at
  );

  select count(*)::integer,
    round(avg((technique_rating + professionalism_rating) / 2.0), 2)
  into v_review_count, v_average_rating
  from public.reviews
  where professional_id = booking.professional_id
    and moderation_status = 'published';

  update public.professional_profiles set
    average_rating = v_average_rating,
    review_count = v_review_count,
    updated_at = p_occurred_at
  where professional_id = booking.professional_id;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'ReviewSubmitted', 1, 'review', p_review_id::text, 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    'booking:' || booking.id::text || ':review',
    jsonb_build_object(
      'clientId', p_client_id,
      'professionalId', booking.professional_id,
      'bookingId', booking.id,
      'reviewId', p_review_id,
      'averageRating', v_average_rating
    )
  );

  if v_average_rating < 3 then
    select id into quality_flag_id from public.professional_quality_flags
    where booking_id = booking.id;
    if quality_flag_id is not null then
      insert into public.domain_event_outbox (
        event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
        occurred_at, correlation_id, causation_id, payload
      ) values (
        'ProfessionalRatingThresholdCrossed', 1, 'professional_quality_flag',
        quality_flag_id::text, 1, p_occurred_at,
        coalesce(booking.client_request_id, booking.id::text), p_review_id::text,
        jsonb_build_object(
          'professionalId', booking.professional_id,
          'bookingId', booking.id,
          'qualityFlagId', quality_flag_id,
          'averageRating', v_average_rating
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'result', 'created',
    'review', jsonb_build_object(
      'id', p_review_id,
      'techniqueRating', p_technique_rating,
      'professionalismRating', p_professionalism_rating,
      'tags', to_jsonb(p_tags),
      'reviewText', p_review_text,
      'createdAt', p_occurred_at
    )
  );
end;
$$;

revoke all on function public.reschedule_client_booking(uuid, uuid, date, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.cancel_client_booking(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.submit_client_booking_review(
  uuid, uuid, uuid, smallint, smallint, text[], text, timestamptz
) from public, anon, authenticated;

grant execute on function public.reschedule_client_booking(uuid, uuid, date, text, timestamptz)
  to service_role;
grant execute on function public.cancel_client_booking(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.submit_client_booking_review(
  uuid, uuid, uuid, smallint, smallint, text[], text, timestamptz
) to service_role;

commit;

begin;

create or replace function private.booking_api(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', booking.id,
    'clientId', booking.client_id,
    'professionalId', booking.professional_id,
    'serviceId', booking.service_id,
    'serviceName', booking.service_name,
    'dateIso', (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date::text,
    'time', trim(to_char(booking.scheduled_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM')),
    'addressLabel', booking.address_label,
    'addressZone', booking.address_zone,
    'addressDetail', booking.address_detail,
    'femaleOnly', booking.female_only,
    'paymentMethod', booking.payment_method::text,
    'servicePrice', booking.service_price,
    'travelFee', booking.travel_fee,
    'total', booking.total,
    'commissionRateBps', booking.commission_rate_bps,
    'status', booking.status::text,
    'cancellationPolicy', booking.cancellation_policy,
    'startedAt', booking.started_at,
    'completedAt', booking.completed_at,
    'createdAt', booking.created_at,
    'paymentIntent', (
      select private.payment_intent_api(payment.id)
      from public.payment_intents payment
      where payment.booking_id = booking.id
    )
  ) || case when review.id is null then '{}'::jsonb else jsonb_build_object(
    'review', jsonb_build_object(
      'id', review.id,
      'techniqueRating', review.technique_rating,
      'professionalismRating', review.professionalism_rating,
      'tags', to_jsonb(review.tags),
      'reviewText', review.review_text,
      'createdAt', review.created_at
    )
  ) end
  from public.bookings booking
  left join public.reviews review on review.booking_id = booking.id
  where booking.id = p_booking_id;
$$;

create or replace function public.find_marketplace_booking_by_request(
  p_client_id uuid,
  p_request_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'booking', private.booking_api(booking.id),
    'paymentIntent', null,
    'duplicate', true
  )
  from public.bookings booking
  where booking.client_id = p_client_id
    and booking.client_request_id = p_request_id;
$$;

drop function public.commit_marketplace_booking(jsonb, jsonb, jsonb);

create function public.commit_marketplace_booking(
  p_input jsonb,
  p_quote jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid := (p_input ->> 'clientId')::uuid;
  v_professional_id uuid := (p_input ->> 'professionalId')::uuid;
  v_service_id uuid := (p_input ->> 'serviceId')::uuid;
  request_id text := p_input ->> 'requestId';
  current_quote jsonb;
  booking_id uuid := extensions.gen_random_uuid();
  occurred_at timestamptz := now();
  service_duration integer;
  existing jsonb;
begin
  existing := public.find_marketplace_booking_by_request(v_client_id, request_id);
  if existing is not null then return existing; end if;

  current_quote := public.quote_marketplace_booking(p_input);
  if current_quote is null or current_quote <> p_quote then return null; end if;
  select duration_minutes into service_duration
  from public.professional_services
  where id = v_service_id and professional_id = v_professional_id;
  if not found then return null; end if;

  insert into public.bookings (
    id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail,
    female_only, payment_method, service_price, travel_fee,
    commission_rate_bps, status, accept_by, assignment_version, version,
    created_at, updated_at
  ) values (
    booking_id,
    request_id,
    v_client_id,
    v_professional_id,
    v_service_id,
    p_quote ->> 'serviceName',
    private.booking_scheduled_start((p_input ->> 'dateIso')::date, p_input ->> 'time'),
    service_duration,
    trim(p_input ->> 'addressLabel'),
    p_quote ->> 'addressZone',
    trim(p_input ->> 'addressDetail'),
    (p_input ->> 'femaleOnly')::boolean,
    (p_input ->> 'paymentMethod')::public.booking_payment_method,
    (p_quote ->> 'servicePrice')::numeric,
    (p_quote ->> 'travelFee')::numeric,
    (p_quote ->> 'commissionRateBps')::integer,
    'requested',
    occurred_at + interval '15 minutes',
    1,
    1,
    occurred_at,
    occurred_at
  );

  insert into public.booking_assignments (
    booking_id, professional_id, assignment_version, assigned_at
  ) values (booking_id, v_professional_id, 1, occurred_at);

  insert into public.booking_status_events (
    booking_id, status, changed_by, note, created_at
  ) values (booking_id, 'requested', v_client_id, 'booking requested', occurred_at);

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'BookingRequested', 1, 'booking', booking_id::text, 1,
    occurred_at, request_id,
    jsonb_build_object(
      'clientId', v_client_id,
      'professionalId', v_professional_id,
      'assignmentVersion', 1
    )
  );

  return jsonb_build_object(
    'booking', private.booking_api(booking_id),
    'paymentIntent', null,
    'duplicate', false
  );
exception
  when unique_violation then
    return public.find_marketplace_booking_by_request(v_client_id, request_id);
end;
$$;

create function public.get_booking_payment_context(
  p_client_id uuid,
  p_booking_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'bookingId', booking.id,
    'clientId', booking.client_id,
    'paymentMethod', booking.payment_method::text,
    'amount', booking.total,
    'currency', 'ETB',
    'bookingStatus', booking.status::text,
    'paymentIntent', private.payment_intent_api(payment.id)
  )
  from public.bookings booking
  left join public.payment_intents payment on payment.booking_id = booking.id
  where booking.id = p_booking_id and booking.client_id = p_client_id;
$$;

create function public.commit_booking_payment_intent(
  p_client_id uuid,
  p_booking_id uuid,
  p_provider_intent jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  payment public.payment_intents%rowtype;
  payment_id uuid := extensions.gen_random_uuid();
  provider_status public.payment_status := (p_provider_intent ->> 'status')::public.payment_status;
  provider_reference text := coalesce(trim(p_provider_intent ->> 'providerReference'), '');
begin
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select * into payment from public.payment_intents
  where booking_id = p_booking_id;
  if found then
    return jsonb_build_object(
      'result', 'duplicate',
      'paymentIntent', private.payment_intent_api(payment.id)
    );
  end if;
  if booking.status <> 'accepted' then
    return jsonb_build_object('result', 'not_accepted');
  end if;
  if provider_reference = ''
    or (booking.payment_method = 'cash' and provider_status <> 'cash_due')
    or (booking.payment_method <> 'cash' and provider_status <> 'pending')
  then
    raise exception 'invalid payment provider intent' using errcode = '22023';
  end if;

  insert into public.payment_intents (
    id, booking_id, client_id, provider, provider_reference, status,
    amount, refunded_amount, version, currency, created_at, updated_at
  ) values (
    payment_id, booking.id, booking.client_id, booking.payment_method,
    provider_reference, provider_status, booking.total, 0, 1, 'ETB',
    p_occurred_at, p_occurred_at
  );

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'PaymentAuthorizationRequested', 1, 'payment', payment_id::text, 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    'booking:' || booking.id::text || ':accepted',
    jsonb_build_object(
      'clientId', booking.client_id,
      'bookingId', booking.id,
      'paymentIntentId', payment_id,
      'provider', booking.payment_method::text,
      'status', provider_status::text,
      'reason', 'client_initiated'
    )
  );

  return jsonb_build_object(
    'result', 'created',
    'paymentIntent', private.payment_intent_api(payment_id)
  );
exception
  when unique_violation then
    select * into payment from public.payment_intents where booking_id = p_booking_id;
    return jsonb_build_object(
      'result', 'duplicate',
      'paymentIntent', private.payment_intent_api(payment.id)
    );
end;
$$;

revoke all on function public.commit_marketplace_booking(jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.get_booking_payment_context(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.commit_booking_payment_intent(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;

grant execute on function public.commit_marketplace_booking(jsonb, jsonb) to service_role;
grant execute on function public.get_booking_payment_context(uuid, uuid) to service_role;
grant execute on function public.commit_booking_payment_intent(uuid, uuid, jsonb, timestamptz) to service_role;

commit;

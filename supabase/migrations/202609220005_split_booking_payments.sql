begin;

-- Existing contracts retain their original payment plan; new online bookings
-- use two installments. Cash is retained only for historical/pilot records.
alter table public.bookings add column payment_plan text not null default 'full'
  check (payment_plan in ('full', 'split'));
alter table public.bookings alter column payment_plan set default 'split';
create function private.set_new_booking_payment_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.payment_plan := case when new.payment_method = 'cash' then 'full' else 'split' end;
  return new;
end;
$$;
revoke all on function private.set_new_booking_payment_plan() from public, anon, authenticated;
create trigger set_new_booking_payment_plan before insert on public.bookings
  for each row execute function private.set_new_booking_payment_plan();
alter table public.bookings add column if not exists accepted_at timestamptz;
alter table public.bookings add column if not exists travel_started_at timestamptz;
alter table public.bookings add column if not exists arrived_at timestamptz;
alter table public.payment_intents add column stage text not null default 'full'
  check (stage in ('full', 'deposit', 'balance'));
alter table public.payment_intents add column attempt integer not null default 1 check (attempt > 0);
alter table public.payment_intents drop constraint payment_intents_booking_id_key;
create unique index payment_installment_attempt on public.payment_intents(booking_id, stage, attempt);
create unique index payment_installment_active on public.payment_intents(booking_id, stage) where status <> 'failed';
create index if not exists booking_tracking_professional_idx on public.booking_tracking(professional_id);
create index if not exists client_identity_reviewed_by_idx on public.client_identity_documents(reviewed_by);

create function private.booking_payment_summary(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with amounts as (
    select b.*, case when b.payment_plan = 'split' then ceil(b.total * 100 / 2) / 100 else b.total end as deposit,
      coalesce((select sum(p.amount - p.refunded_amount) from public.payment_intents p
        where p.booking_id = b.id and p.status in ('captured', 'cash_collected')), 0) as paid
    from public.bookings b where b.id = p_booking_id
  ) select jsonb_build_object(
    'plan', payment_plan, 'depositAmount', deposit, 'balanceAmount', total - deposit,
    'paidAmount', paid, 'outstandingAmount', greatest(0, total - paid),
    'depositPaid', paid >= deposit, 'fullyPaid', paid >= total,
    'dueStage', case when status = 'accepted' and paid < deposit then
      case when payment_plan = 'split' then 'deposit' else 'full' end
      when status = 'completed' and paid >= deposit and paid < total then 'balance' else null end
  ) from amounts;
$$;
revoke all on function private.booking_payment_summary(uuid) from public, anon, authenticated;
grant execute on function private.booking_payment_summary(uuid) to service_role;

create or replace function public.get_booking_payment_context(p_client_id uuid, p_booking_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'bookingId', b.id, 'clientId', b.client_id, 'paymentMethod', b.payment_method,
    'amount', case when s.value ->> 'dueStage' = 'deposit' then (s.value ->> 'depositAmount')::numeric
      else (s.value ->> 'outstandingAmount')::numeric end,
    'currency', 'ETB', 'bookingStatus', b.status, 'stage', s.value ->> 'dueStage',
    'attempt', coalesce(p.attempt, 0) + case when p.id is null or p.status = 'failed' then 1 else 0 end,
    'paymentIntent', case when p.status <> 'failed' then private.payment_intent_api(p.id) else null end
  ) from public.bookings b
  cross join lateral (select private.booking_payment_summary(b.id) as value) s
  left join lateral (select * from public.payment_intents
    where booking_id = b.id and stage = s.value ->> 'dueStage' order by attempt desc limit 1) p on true
  where b.id = p_booking_id and b.client_id = p_client_id;
$$;

create function private.settle_split_booking(p_booking_id uuid, p_occurred_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings%rowtype;
  p public.payment_intents%rowtype;
  commission numeric(12,2);
  part numeric(12,2);
  allocated numeric(12,2) := 0;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if b.payment_plan <> 'split' or b.status <> 'completed' then return; end if;
  if not (private.booking_payment_summary(b.id) ->> 'fullyPaid')::boolean then return; end if;
  commission := round(b.service_price * b.commission_rate_bps / 10000);
  for p in select * from public.payment_intents where booking_id = b.id and status = 'captured' order by stage desc loop
    part := case when p.stage = 'balance' then commission - allocated else round(commission * p.amount / b.total, 2) end;
    allocated := allocated + part;
    insert into public.ledger_entries(booking_id, payment_intent_id, entry_group, account, amount, created_at) values
      (b.id, p.id, 'release:' || p.id, 'escrow_liability', p.amount, p_occurred_at),
      (b.id, p.id, 'release:' || p.id, 'professional_payable', -(p.amount - part), p_occurred_at),
      (b.id, p.id, 'release:' || p.id, 'platform_commission', -part, p_occurred_at)
      on conflict (entry_group, account) do nothing;
  end loop;
  insert into public.professional_earnings(professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at)
    values(b.professional_id, b.id, b.total, commission, b.total - commission, p_occurred_at)
    on conflict (booking_id) do nothing;
end;
$$;
revoke all on function private.settle_split_booking(uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.settle_split_booking(uuid, timestamptz) to service_role;
CREATE OR REPLACE FUNCTION private.payment_intent_api(p_payment_intent_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', payment.id,
    'stage', payment.stage, 'attempt', payment.attempt,
    'bookingId', payment.booking_id,
    'provider', payment.provider::text,
    'providerReference', payment.provider_reference,
    'status', payment.status::text,
    'amount', payment.amount,
    'refundedAmount', payment.refunded_amount,
    'currency', payment.currency,
    'checkoutUrl', payment.checkout_url,
    'createdAt', payment.created_at,
    'updatedAt', payment.updated_at
  )
  from public.payment_intents payment
  where payment.id = p_payment_intent_id;
$function$;

CREATE OR REPLACE FUNCTION private.booking_api(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id', booking.id,
    'paymentSummary', private.booking_payment_summary(booking.id),
    'payments', coalesce((select jsonb_agg(private.payment_intent_api(p.id) order by p.created_at, p.attempt) from public.payment_intents p where p.booking_id = booking.id), '[]'::jsonb),
    'acceptedAt', booking.accepted_at, 'travelStartedAt', booking.travel_started_at, 'arrivedAt', booking.arrived_at,
    'clientId', booking.client_id,
    'professionalId', booking.professional_id,
    'serviceId', booking.service_id,
    'serviceName', booking.service_name,
    'dateIso', (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date::text,
    'time', trim(to_char(booking.scheduled_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM')),
    'addressLabel', booking.address_label,
    'addressZone', booking.address_zone,
    'addressDetail', booking.address_detail,
    'latitude', booking.latitude,
    'longitude', booking.longitude,
    'femaleOnly', booking.female_only,
    'paymentMethod', booking.payment_method::text,
    'servicePrice', booking.service_price,
    'travelFee', booking.travel_fee,
    'total', booking.total,
    'commissionRateBps', booking.commission_rate_bps,
    'status', booking.status::text,
    'cancellationPolicy', booking.cancellation_policy,
    'cancelledBy', booking.cancelled_by::text,
    'cancellationReason', booking.cancellation_reason,
    'startedAt', booking.started_at,
    'completedAt', booking.completed_at,
    'createdAt', booking.created_at,
    'paymentIntent', (
      select private.payment_intent_api(payment.id)
      from public.payment_intents payment
      where payment.booking_id = booking.id
      and (private.booking_payment_summary(booking.id) ->> 'dueStage' is null or payment.stage = private.booking_payment_summary(booking.id) ->> 'dueStage')
      order by payment.created_at desc, payment.attempt desc limit 1
    ),
    'tracking', private.booking_tracking_api(booking.id)
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
$function$;

CREATE OR REPLACE FUNCTION public.commit_booking_payment_intent(p_client_id uuid, p_booking_id uuid, p_provider_intent jsonb, p_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  context jsonb;
  v_stage text := coalesce(p_provider_intent ->> 'stage', 'full');
  v_attempt integer := coalesce((p_provider_intent ->> 'attempt')::integer, 1);
  booking public.bookings%rowtype;
  payment public.payment_intents%rowtype;
  payment_id uuid := extensions.gen_random_uuid();
  provider_status public.payment_status := (p_provider_intent ->> 'status')::public.payment_status;
  provider_reference text := coalesce(trim(p_provider_intent ->> 'providerReference'), '');
  checkout_url text := nullif(trim(coalesce(p_provider_intent ->> 'checkoutUrl', '')), '');
begin
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select * into payment from public.payment_intents
  where booking_id = p_booking_id and payment_intents.stage = v_stage and payment_intents.attempt = v_attempt;
  if found then
    return jsonb_build_object(
      'result', 'duplicate',
      'paymentIntent', private.payment_intent_api(payment.id)
    );
  end if;
  context := public.get_booking_payment_context(p_client_id, p_booking_id);
  if context ->> 'stage' is null or context ->> 'stage' <> v_stage
    or (context ->> 'attempt')::integer <> v_attempt
    or (p_provider_intent ? 'amount' and (p_provider_intent ->> 'amount')::numeric <> (context ->> 'amount')::numeric) then
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
    amount, refunded_amount, version, currency, checkout_url, created_at, updated_at, stage, attempt
  ) values (
    payment_id, booking.id, booking.client_id, booking.payment_method,
    provider_reference, provider_status, (context ->> 'amount')::numeric, 0, 1, 'ETB', checkout_url,
    p_occurred_at, p_occurred_at, v_stage, v_attempt
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
    select * into payment from public.payment_intents where booking_id = p_booking_id and payment_intents.stage = v_stage and payment_intents.attempt = v_attempt;
    if not found then raise; end if;
    return jsonb_build_object(
      'result', 'duplicate',
      'paymentIntent', private.payment_intent_api(payment.id)
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_professional_dashboard(p_professional_id uuid, p_earnings_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', booking.id,
        'arrivedAt', booking.arrived_at,
        'paymentSummary', private.booking_payment_summary(booking.id),
        'clientId', booking.client_id,
        'clientName', client.full_name,
        'serviceName', booking.service_name,
        'servicePrice', booking.service_price,
        'travelFee', booking.travel_fee,
        'total', booking.total,
        'commissionRateBps', booking.commission_rate_bps,
        'paymentMethod', booking.payment_method::text,
        'dateIso', (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date::text,
        'time', trim(to_char(booking.scheduled_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM')),
        'addressLabel', booking.address_label,
        'addressZone', booking.address_zone,
        'addressDetail', booking.address_detail,
        'latitude', booking.latitude,
        'longitude', booking.longitude,
        'status', booking.status::text,
        'startedAt', booking.started_at,
        'completedAt', booking.completed_at,
        'tracking', private.booking_tracking_api(booking.id)
      ) order by booking.scheduled_start, booking.created_at)
      from public.bookings booking
      join public.profiles client on client.user_id = booking.client_id
      where booking.professional_id = p_professional_id
        and booking.status not in ('cancelled', 'completed')
    ), '[]'::jsonb),
    'available', profile.is_available,
    'completedCount', (
      select count(*) from public.bookings booking
      where booking.professional_id = p_professional_id and booking.status = 'completed'
    ),
    'weekEarnings', coalesce((
      select sum(earning.net_amount) from public.professional_earnings earning
      where earning.professional_id = p_professional_id
        and earning.created_at >= p_earnings_since
    ), 0)
  )
  from public.professional_profiles profile
  where profile.professional_id = p_professional_id
    and profile.approval_status = 'approved'
    and not profile.is_hidden;
$function$;

CREATE OR REPLACE FUNCTION public.transition_professional_booking(p_professional_id uuid, p_booking_id uuid, p_action text, p_occurred_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  booking public.bookings%rowtype;
  payment public.payment_intents%rowtype;
  target_status public.booking_status;
  source_status public.booking_status;
  booking_event_type text;
  cancellation_policy text;
  commission_amount numeric(12, 2);
  professional_amount numeric(12, 2);
  retained_amount numeric(12, 2);
  refund_amount numeric(12, 2);
begin
  if p_action not in ('accept', 'decline', 'travel', 'arrive', 'check-in', 'complete', 'no-show') then
    raise exception 'invalid professional booking action' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_professional_id::text, 0));
  if p_action = 'travel' and exists(select 1 from public.bookings where professional_id = p_professional_id
    and id <> p_booking_id and status in ('on_the_way','in_progress')) then return 'invalid_transition'; end if;

  select * into booking from public.bookings
  where id = p_booking_id and professional_id = p_professional_id
  for update;
  if not found then return 'not_found'; end if;

  select * into payment from public.payment_intents
  where booking_id = p_booking_id and stage in ('full', 'deposit') and status <> 'failed'
  for update;

  if p_action = 'arrive' then
    if booking.arrived_at is not null then return 'updated'; end if;
    if booking.status <> 'on_the_way' then return 'invalid_transition'; end if;
    update public.bookings set arrived_at = p_occurred_at, version = version + 1, updated_at = p_occurred_at where id = booking.id;
    insert into public.booking_status_events(booking_id, status, changed_by, note, created_at)
      values(booking.id, booking.status, p_professional_id, 'professional action: arrive', p_occurred_at);
    insert into public.domain_event_outbox(event_type, schema_version, aggregate_type, aggregate_id, aggregate_version, occurred_at, correlation_id, payload)
      values('ProfessionalArrived', 1, 'booking', booking.id::text, booking.version + 1, p_occurred_at,
        coalesce(booking.client_request_id, booking.id::text), jsonb_build_object('clientId', booking.client_id, 'professionalId', p_professional_id));
    return 'updated';
  end if;
  if p_action = 'check-in' and booking.payment_plan = 'split' and booking.arrived_at is null then return 'invalid_transition'; end if;

  if p_action = 'no-show' then
    target_status := 'cancelled';
    cancellation_policy := 'client_no_show';
    if booking.status = 'cancelled' and booking.cancellation_policy = 'client_no_show' then
      return 'updated';
    end if;
    if booking.status <> 'on_the_way' then return 'invalid_transition'; end if;
    if payment.id is null or payment.status not in ('captured', 'cash_due') then
      return 'payment_required';
    end if;
  else
    if p_action = 'accept' then
      source_status := 'requested';
      target_status := 'accepted';
    elsif p_action = 'decline' then
      source_status := 'requested';
      target_status := 'cancelled';
      cancellation_policy := 'full_refund';
    elsif p_action = 'travel' then
      source_status := 'accepted';
      target_status := 'on_the_way';
    elsif p_action = 'check-in' then
      source_status := 'on_the_way';
      target_status := 'in_progress';
    else
      source_status := 'in_progress';
      target_status := 'completed';
    end if;
    if booking.status = target_status then return 'updated'; end if;
    if booking.status <> source_status then return 'invalid_transition'; end if;
    if p_action = 'travel' and (
      payment.id is null or payment.status not in ('captured', 'cash_due')
    ) then return 'payment_required'; end if;
    if p_action = 'complete' and (
      payment.id is null or payment.status not in ('captured', 'cash_due', 'cash_collected')
    ) then return 'payment_required'; end if;
  end if;

  if p_action = 'decline' then
    update public.bookings set
      status = 'cancelled', cancelled_by = 'professional',
      cancellation_policy = 'full_refund', cancellation_reason = 'professional_declined',
      cancelled_at = p_occurred_at, version = version + 1,
      updated_at = p_occurred_at
    where id = p_booking_id and version = booking.version;
  elsif p_action = 'no-show' then
    update public.bookings set
      status = 'cancelled', cancelled_by = 'client',
      cancellation_policy = 'client_no_show', cancellation_reason = 'client_no_show',
      cancelled_at = p_occurred_at, version = version + 1,
      updated_at = p_occurred_at
    where id = p_booking_id and version = booking.version;
  elsif p_action = 'check-in' then
    update public.bookings set
      status = 'in_progress', started_at = p_occurred_at,
      version = version + 1, updated_at = p_occurred_at
    where id = p_booking_id and version = booking.version;
  elsif p_action = 'complete' then
    update public.bookings set
      status = 'completed', completed_at = p_occurred_at,
      version = version + 1, updated_at = p_occurred_at
    where id = p_booking_id and version = booking.version;
  else
    update public.bookings set
      status = target_status, version = version + 1, updated_at = p_occurred_at,
      accepted_at = case when p_action = 'accept' then p_occurred_at else accepted_at end,
      travel_started_at = case when p_action = 'travel' then p_occurred_at else travel_started_at end
    where id = p_booking_id and version = booking.version;
  end if;
  if not found then return 'invalid_transition'; end if;

  commission_amount := round(booking.service_price * booking.commission_rate_bps / 10000);

  if p_action in ('decline', 'no-show') and payment.id is not null and payment.status <> 'refunded' then
    if payment.status = 'cash_collected' then
      raise exception 'collected cash cannot be refunded automatically';
    end if;
    if p_action = 'no-show' then
      professional_amount := least(booking.travel_fee, payment.amount);
      commission_amount := least(commission_amount, payment.amount - professional_amount);
      retained_amount := commission_amount + professional_amount;
    else
      professional_amount := 0;
      retained_amount := 0;
    end if;
    refund_amount := greatest(0, payment.amount - retained_amount);

    if payment.status = 'captured' then
      insert into public.ledger_entries (
        booking_id, payment_intent_id, entry_group, account, amount, created_at
      ) values
        (booking.id, payment.id, 'cancellation:' || cancellation_policy || ':' || payment.id, 'provider_clearing', -refund_amount, p_occurred_at),
        (booking.id, payment.id, 'cancellation:' || cancellation_policy || ':' || payment.id, 'escrow_liability', payment.amount, p_occurred_at),
        (booking.id, payment.id, 'cancellation:' || cancellation_policy || ':' || payment.id, 'professional_payable', -professional_amount, p_occurred_at),
        (booking.id, payment.id, 'cancellation:' || cancellation_policy || ':' || payment.id, 'platform_commission', -(retained_amount - professional_amount), p_occurred_at)
      on conflict (entry_group, account) do nothing;

      if retained_amount > 0 then
        insert into public.professional_earnings (
          professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at
        ) values (
          p_professional_id, booking.id, retained_amount, commission_amount,
          professional_amount, p_occurred_at
        ) on conflict (booking_id) do nothing;
      end if;
    end if;

    if payment.status = 'cash_due' and retained_amount > 0 then
      update public.payment_intents
      set amount = retained_amount, version = version + 1, updated_at = p_occurred_at
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
          'clientId', payment.client_id, 'bookingId', booking.id,
          'paymentIntentId', payment.id, 'provider', payment.provider::text,
          'reason', 'booking_cancellation',
          'refundedAmount', case when payment.status = 'captured' then refund_amount else 0 end
        )
      );
    end if;
  end if;

  if p_action = 'complete' and booking.payment_plan = 'full' then
    if payment.status = 'cash_due' then
      update public.payment_intents set
        status = 'cash_collected', version = version + 1, updated_at = p_occurred_at
      where id = payment.id and version = payment.version;

      insert into public.domain_event_outbox (
        event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
        occurred_at, correlation_id, causation_id, payload
      ) values (
        'PaymentCaptured', 1, 'payment', payment.id::text, payment.version + 1,
        p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
        'booking:' || booking.id::text || ':completed',
        jsonb_build_object(
          'clientId', payment.client_id, 'bookingId', booking.id,
          'paymentIntentId', payment.id, 'provider', payment.provider::text,
          'reason', 'cash_collection'
        )
      );

      insert into public.ledger_entries (
        booking_id, payment_intent_id, entry_group, account, amount, created_at
      ) values
        (booking.id, payment.id, 'capture:' || payment.id, 'provider_clearing', payment.amount, p_occurred_at),
        (booking.id, payment.id, 'capture:' || payment.id, 'escrow_liability', -payment.amount, p_occurred_at)
      on conflict (entry_group, account) do nothing;
    end if;

    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'release:' || payment.id, 'escrow_liability', payment.amount, p_occurred_at),
      (booking.id, payment.id, 'release:' || payment.id, 'professional_payable', -(payment.amount - commission_amount), p_occurred_at),
      (booking.id, payment.id, 'release:' || payment.id, 'platform_commission', -commission_amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;

    insert into public.professional_earnings (
      professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at
    ) values (
      p_professional_id, booking.id, booking.total, commission_amount,
      booking.total - commission_amount, p_occurred_at
    ) on conflict (booking_id) do nothing;
  end if;

  insert into public.booking_status_events (booking_id, status, changed_by, note, created_at)
  values (
    booking.id,
    target_status,
    p_professional_id,
    'professional action: ' || p_action,
    p_occurred_at
  );

  booking_event_type := case p_action
    when 'accept' then 'BookingAccepted'
    when 'decline' then 'BookingDeclined'
    when 'travel' then 'ProfessionalTravelStarted'
    when 'check-in' then 'VisitStarted'
    when 'complete' then 'BookingCompleted'
    else 'BookingCancelled' end;

  if p_action = 'no-show' then
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      booking_event_type, 1, 'booking', booking.id::text, booking.version + 1,
      p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
      jsonb_build_object(
        'clientId', booking.client_id, 'professionalId', p_professional_id,
        'cancelledBy', 'client', 'cancellationPolicy', 'client_no_show'
      )
    );
  else
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      booking_event_type, 1, 'booking', booking.id::text, booking.version + 1,
      p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
      jsonb_build_object('clientId', booking.client_id, 'professionalId', p_professional_id)
    );
  end if;

  return 'updated';
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_client_booking(p_client_id uuid, p_booking_id uuid, p_occurred_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  where booking_id = booking.id and status <> 'failed'
  for update;
  professional_amount := least(professional_amount, coalesce(payment.amount, 0));
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
$function$;

CREATE OR REPLACE FUNCTION public.process_provider_payment_event(p_event_id text, p_provider booking_payment_method, p_provider_reference text, p_status payment_status, p_payload_hash text, p_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  duplicate public.payment_events%rowtype;
  payment public.payment_intents%rowtype;
  event_type text;
  booking public.bookings%rowtype;
begin
  select * into duplicate from public.payment_events where event_id = p_event_id;
  if found then
    if duplicate.payload_hash <> p_payload_hash then
      return jsonb_build_object('result', 'invalid_transition');
    end if;
    return jsonb_build_object(
      'result', 'duplicate',
      'paymentIntent', private.payment_intent_api(duplicate.payment_intent_id)
    );
  end if;

  -- Always lock the booking first, matching cancellation/initiation/checkout.
  select b.* into booking from public.bookings b join public.payment_intents p on p.booking_id = b.id
    where p.provider_reference = p_provider_reference and p.provider = p_provider for update of b;
  select * into payment from public.payment_intents
  where provider_reference = p_provider_reference and provider = p_provider
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if p_status not in ('authorized', 'captured', 'failed')
    or payment.status in ('refunded', 'cash_due', 'cash_collected')
    or (payment.status = 'failed' and p_status <> 'failed')
    or (payment.status = 'captured' and p_status <> 'captured')
  then return jsonb_build_object('result', 'invalid_transition'); end if;

  insert into public.payment_events (
    event_id, payment_intent_id, event_type, payload_hash, created_at
  ) values (
    p_event_id, payment.id, p_status::text, p_payload_hash, p_occurred_at
  );
  update public.payment_intents set
    status = p_status, version = version + 1, updated_at = p_occurred_at
  where id = payment.id and version = payment.version;
  if not found then return jsonb_build_object('result', 'invalid_transition'); end if;

  if p_status = 'captured' and payment.status <> 'captured' then
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (payment.booking_id, payment.id, 'capture:' || payment.id, 'provider_clearing', payment.amount, p_occurred_at),
      (payment.booking_id, payment.id, 'capture:' || payment.id, 'escrow_liability', -payment.amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
  end if;

  if p_status = 'captured' then perform private.settle_split_booking(payment.booking_id, p_occurred_at); end if;

  event_type := case p_status
    when 'authorized' then 'PaymentAuthorized'
    when 'captured' then 'PaymentCaptured'
    else 'PaymentFailed' end;
  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    event_type, 1, 'payment', payment.id::text, payment.version + 1,
    p_occurred_at, payment.booking_id::text, p_event_id,
    jsonb_build_object(
      'clientId', payment.client_id,
      'professionalId', booking.professional_id, 'stage', payment.stage,
      'bookingId', payment.booking_id,
      'paymentIntentId', payment.id,
      'provider', payment.provider::text,
      'reason', 'provider_webhook'
    )
  );

  return jsonb_build_object(
    'result', 'updated',
    'paymentIntent', private.payment_intent_api(payment.id)
  );
exception
  when unique_violation then
    select * into duplicate from public.payment_events where event_id = p_event_id;
    if duplicate.payload_hash = p_payload_hash then
      return jsonb_build_object(
        'result', 'duplicate',
        'paymentIntent', private.payment_intent_api(duplicate.payment_intent_id)
      );
    end if;
    return jsonb_build_object('result', 'invalid_transition');
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_booking_location(p_professional_id uuid, p_booking_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy_meters double precision, p_heading double precision, p_speed_mps double precision, p_recorded_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  booking_status public.booking_status;
begin
  select booking.status into booking_status
  from public.bookings booking
  where booking.id = p_booking_id and booking.professional_id = p_professional_id for update;
  if not found then return 'not_found'; end if;
  if booking_status not in ('on_the_way', 'in_progress') then return 'not_active'; end if;

  insert into public.booking_tracking (
    booking_id, professional_id, latitude, longitude, accuracy_meters, heading, speed_mps, recorded_at, updated_at
  ) values (
    p_booking_id, p_professional_id, p_latitude, p_longitude, p_accuracy_meters,
    case when p_heading is null or p_heading < 0 then null else p_heading end,
    case when p_speed_mps is null or p_speed_mps < 0 then null else p_speed_mps end,
    p_recorded_at, now()
  ) on conflict (booking_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    heading = excluded.heading,
    speed_mps = excluded.speed_mps,
    recorded_at = greatest(public.booking_tracking.recorded_at, excluded.recorded_at),
    updated_at = now()
  where excluded.recorded_at >= public.booking_tracking.recorded_at;
  return 'updated';
end;
$function$;

create function public.process_verified_provider_payment_event(
  p_event_id text, p_provider public.booking_payment_method, p_provider_reference text,
  p_status public.payment_status, p_payload_hash text, p_occurred_at timestamptz,
  p_verified_amount numeric, p_verified_currency text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare payment public.payment_intents%rowtype;
begin
  perform b.id from public.bookings b join public.payment_intents p on p.booking_id = b.id
    where p.provider_reference = p_provider_reference and p.provider = p_provider for update of b;
  select * into payment from public.payment_intents where provider_reference = p_provider_reference and provider = p_provider for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  if p_verified_amount is distinct from payment.amount or p_verified_currency is distinct from payment.currency then
    return jsonb_build_object('result','invalid_transition');
  end if;
  return public.process_provider_payment_event(p_event_id,p_provider,p_provider_reference,p_status,p_payload_hash,p_occurred_at);
end;
$$;
revoke all on function public.process_verified_provider_payment_event(text,public.booking_payment_method,text,public.payment_status,text,timestamptz,numeric,text) from public, anon, authenticated;
grant execute on function public.process_verified_provider_payment_event(text,public.booking_payment_method,text,public.payment_status,text,timestamptz,numeric,text) to service_role;
create function private.refund_split_booking(p_audit_id uuid, p_admin_id uuid, p_booking_id uuid, p_occurred_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.payment_intents%rowtype; b public.bookings%rowtype; remaining numeric(12,2); changed boolean := false; last_id uuid;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  perform id from public.professional_earnings where booking_id = b.id for update;
  if exists(select 1 from public.professional_earnings where booking_id = b.id and payout_id is not null) then return jsonb_build_object('result','payout_locked'); end if;
  for p in select * from public.payment_intents where booking_id = b.id and status <> 'failed' order by created_at, stage for update loop
    last_id := p.id;
    select coalesce(sum(amount),0) into remaining from public.ledger_entries where payment_intent_id = p.id and account = 'provider_clearing';
    if p.status = 'refunded' and remaining = 0 then continue; end if;
    if remaining > 0 then
      insert into public.ledger_entries(booking_id,payment_intent_id,entry_group,account,amount,created_at)
        select b.id,p.id,'admin-refund-all:' || p.id,account,-sum(amount),p_occurred_at
        from public.ledger_entries where payment_intent_id = p.id group by account
        on conflict(entry_group,account) do nothing;
    end if;
    update public.payment_intents set status='refunded',refunded_amount=p.refunded_amount+remaining,version=version+1,updated_at=p_occurred_at where id=p.id;
    changed := true;
    insert into public.domain_event_outbox(event_type,schema_version,aggregate_type,aggregate_id,aggregate_version,occurred_at,correlation_id,causation_id,payload)
      values('PaymentRefunded',1,'payment',p.id::text,p.version+1,p_occurred_at,b.id::text,'admin-refund:' || b.id,
        jsonb_build_object('clientId',b.client_id,'bookingId',b.id,'paymentIntentId',p.id,'provider',p.provider,'reason','admin_refund','refundedAmount',p.refunded_amount+remaining));
  end loop;
  if last_id is null then return jsonb_build_object('result','not_found'); end if;
  delete from public.professional_earnings where booking_id=b.id;
  insert into public.admin_audit_logs(id,admin_id,action,target_type,target_id,metadata,created_at)
    values(p_audit_id,p_admin_id,'payment.refunded','booking',b.id::text,jsonb_build_object('allInstallments',true,'duplicate',not changed),p_occurred_at);
  return jsonb_build_object('result',case when changed then 'refunded' else 'already_refunded' end,'paymentIntent',private.payment_intent_api(last_id));
end;
$$;
revoke all on function private.refund_split_booking(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.refund_split_booking(uuid,uuid,uuid,timestamptz) to service_role;
CREATE OR REPLACE FUNCTION public.refund_admin_booking(p_audit_id uuid, p_admin_id uuid, p_booking_id uuid, p_occurred_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  booking public.bookings%rowtype;
  payment public.payment_intents%rowtype;
  earning public.professional_earnings%rowtype;
  has_partial_cancellation boolean;
  commission_amount numeric(12, 2);
  professional_amount numeric(12, 2);
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  select * into booking from public.bookings where id = p_booking_id for update;
  if booking.payment_plan = 'split' then return private.refund_split_booking(p_audit_id,p_admin_id,p_booking_id,p_occurred_at); end if;
  select * into payment from public.payment_intents where booking_id = p_booking_id for update;
  if booking.id is null or payment.id is null then return jsonb_build_object('result', 'not_found'); end if;
  has_partial_cancellation := booking.cancellation_policy in ('travel_fee_forfeit', 'client_no_show');
  if payment.status = 'refunded' and (not has_partial_cancellation or payment.refunded_amount >= payment.amount) then
    insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
    values (p_audit_id, p_admin_id, 'payment.refunded', 'booking', p_booking_id::text,
      jsonb_build_object('paymentIntentId', payment.id, 'duplicate', true), p_occurred_at);
    return jsonb_build_object('result', 'already_refunded', 'paymentIntent', private.payment_intent_api(payment.id));
  end if;
  if payment.status = 'failed' then return jsonb_build_object('result', 'not_refundable'); end if;
  select * into earning from public.professional_earnings where booking_id = p_booking_id for update;
  if earning.payout_id is not null then return jsonb_build_object('result', 'payout_locked'); end if;

  commission_amount := round(booking.service_price * booking.commission_rate_bps / 10000);
  if payment.status = 'refunded' and has_partial_cancellation then
    commission_amount := case when booking.cancellation_policy = 'client_no_show' then commission_amount else 0 end;
    professional_amount := booking.travel_fee;
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'admin-retained-refund:' || payment.id, 'provider_clearing', -(payment.amount - payment.refunded_amount), p_occurred_at),
      (booking.id, payment.id, 'admin-retained-refund:' || payment.id, 'professional_payable', professional_amount, p_occurred_at),
      (booking.id, payment.id, 'admin-retained-refund:' || payment.id, 'platform_commission', commission_amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
    delete from public.professional_earnings where booking_id = booking.id;
  end if;

  if exists (
    select 1 from public.ledger_entries
    where payment_intent_id = payment.id and entry_group = 'release:' || payment.id::text
  ) then
    commission_amount := round(booking.service_price * booking.commission_rate_bps / 10000);
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'release-reversal:' || payment.id, 'escrow_liability', -payment.amount, p_occurred_at),
      (booking.id, payment.id, 'release-reversal:' || payment.id, 'professional_payable', payment.amount - commission_amount, p_occurred_at),
      (booking.id, payment.id, 'release-reversal:' || payment.id, 'platform_commission', commission_amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
    delete from public.professional_earnings where booking_id = booking.id;
  end if;

  if payment.status in ('captured', 'cash_collected') then
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'refund:' || payment.id, 'provider_clearing', -payment.amount, p_occurred_at),
      (booking.id, payment.id, 'refund:' || payment.id, 'escrow_liability', payment.amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
  end if;

  update public.payment_intents set status = 'refunded', refunded_amount = payment.amount,
    version = version + 1, updated_at = p_occurred_at
  where id = payment.id and version = payment.version;
  if not found then raise exception 'payment changed during administrator refund'; end if;
  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'PaymentRefunded', 1, 'payment', payment.id::text, payment.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    'admin-refund:' || booking.id::text,
    jsonb_build_object(
      'clientId', booking.client_id, 'bookingId', booking.id,
      'paymentIntentId', payment.id, 'provider', payment.provider::text,
      'reason', 'admin_refund', 'refundedAmount', payment.amount
    )
  );
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'payment.refunded', 'booking', p_booking_id::text,
    jsonb_build_object('paymentIntentId', payment.id, 'duplicate', false), p_occurred_at);
  return jsonb_build_object('result', 'refunded', 'paymentIntent', private.payment_intent_api(payment.id));
end;
$function$;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='payment_intents') then
    alter publication supabase_realtime add table public.payment_intents;
  end if;
end $$;
create function private.clear_finished_booking_tracking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('completed','cancelled') then delete from public.booking_tracking where booking_id = new.id; end if;
  return new;
end;
$$;
revoke all on function private.clear_finished_booking_tracking() from public,anon,authenticated;
create trigger clear_finished_booking_tracking after update of status on public.bookings
  for each row execute function private.clear_finished_booking_tracking();
commit;

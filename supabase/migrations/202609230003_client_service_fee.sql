begin;

-- ---------------------------------------------------------------------------
-- Client-side service fee.
--
-- The app has always shown "service price + service fee + travel fee", and the
-- SQLite backend stored it that way, but Postgres totals were service price +
-- travel fee only, so the "Estimated total" the server sent back dropped the
-- fee. This migration makes Postgres carry the fee explicitly:
--
--   service_fee = round(service_price × commission rate)   (snapshotted at quote)
--   total       = service_price + service_fee + travel_fee (generated column)
--
-- The fee mirrors the platform commission, so on settlement the professional
-- nets the full service price plus their travel fee and Konjo keeps the fee.
-- Checkout, deposits, refunds and the professional dashboard all read `total`,
-- so they pick the new amount up automatically.
-- ---------------------------------------------------------------------------

-- 1. Store the fee and fold it into the generated total. Nothing depends on
--    the old generated column except its own expression.
alter table public.bookings
  add column if not exists service_fee numeric(12, 2) not null default 0 check (service_fee >= 0);
alter table public.bookings drop column total;
alter table public.bookings
  add column total numeric(12, 2) generated always as (service_price + service_fee + travel_fee) stored;

-- 2. Quotes carry the fee. Travel fee stays 0 until the professional accepts.
create or replace function public.quote_marketplace_booking(p_input jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_professional_id uuid := (p_input ->> 'professionalId')::uuid;
  v_client_id uuid := (p_input ->> 'clientId')::uuid;
  service_record record;
  zone_record record;
  commission integer;
  service_fee numeric(12, 2);
  availability jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = v_client_id and account_role = 'client'
  ) then return null; end if;

  select service.id, service.name, service.duration_minutes, service.price,
    profile.female_only_eligible, category.slug as category_slug
  into service_record
  from public.professional_services service
  join public.professional_profiles profile on profile.professional_id = service.professional_id
  join public.service_categories category on category.id = service.category_id
  where service.professional_id = v_professional_id
    and service.active
    and service.id::text = p_input ->> 'serviceId'
    and profile.approval_status = 'approved'
    and not profile.is_hidden
    and profile.is_available;
  if not found then return null; end if;
  if coalesce((p_input ->> 'femaleOnly')::boolean, false)
    and not service_record.female_only_eligible
  then return null; end if;

  select zone.id, zone.name into zone_record
  from public.zones zone
  where zone.active
    and lower(zone.name) = lower(trim(p_input ->> 'addressZone'));
  if not found then return null; end if;

  if service_record.category_slug = 'massage'
    and not exists (
      select 1 from public.client_identity_verifications
      where client_id = v_client_id
    )
  then return null; end if;

  availability := private.professional_availability_api(
    v_professional_id,
    (p_input ->> 'dateIso')::date,
    service_record.id::text,
    null
  );
  if not coalesce(availability -> 'slots', '[]'::jsonb) ? (p_input ->> 'time') then
    return null;
  end if;

  select value_integer into commission
  from public.platform_settings where key = 'commission_rate_bps';
  service_fee := round(service_record.price * coalesce(commission, 0) / 10000.0);
  return jsonb_build_object(
    'serviceName', service_record.name,
    'addressZone', zone_record.name,
    'servicePrice', service_record.price,
    'serviceFee', service_fee,
    'travelFee', 0,
    'total', service_record.price + service_fee,
    'commissionRateBps', commission
  );
end;
$$;

-- 3. Booking creation persists the quoted fee.
create or replace function public.commit_marketplace_booking(
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
  v_latitude double precision;
  v_longitude double precision;
begin
  existing := public.find_marketplace_booking_by_request(v_client_id, request_id);
  if existing is not null then return existing; end if;

  current_quote := public.quote_marketplace_booking(p_input);
  if current_quote is null or current_quote <> p_quote then return null; end if;
  select duration_minutes into service_duration
  from public.professional_services
  where id = v_service_id and professional_id = v_professional_id;
  if not found then return null; end if;

  -- Prefer the saved address pin; fall back to coordinates sent with the request.
  if (p_input ->> 'addressId') is not null then
    select address.latitude, address.longitude into v_latitude, v_longitude
    from public.client_addresses address
    where address.id::text = p_input ->> 'addressId' and address.client_id = v_client_id;
  end if;
  if v_latitude is null and (p_input ->> 'latitude') is not null and (p_input ->> 'longitude') is not null then
    v_latitude := (p_input ->> 'latitude')::double precision;
    v_longitude := (p_input ->> 'longitude')::double precision;
  end if;

  insert into public.bookings (
    id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail,
    latitude, longitude,
    female_only, payment_method, service_price, service_fee, travel_fee,
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
    v_latitude,
    v_longitude,
    (p_input ->> 'femaleOnly')::boolean,
    (p_input ->> 'paymentMethod')::public.booking_payment_method,
    (p_quote ->> 'servicePrice')::numeric,
    coalesce((p_quote ->> 'serviceFee')::numeric, 0),
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

-- 4. The client booking document's `serviceFee` field is defined in
--    202609230004_restore_split_payment_projections.sql, which holds the single
--    latest body of that projection.

-- 5. The acceptance event reports the stored total (now including the fee)
--    rather than recomputing it.
create or replace function public.transition_professional_booking(
  p_professional_id uuid,
  p_booking_id uuid,
  p_action text,
  p_occurred_at timestamptz,
  p_travel_fee numeric default null
)
returns text
language plpgsql
set search_path to ''
as $function$
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
  travel_fee_cap integer;
  accepted_travel_fee numeric(12, 2);
  accepted_total numeric(12, 2);
begin
  if p_action not in ('accept', 'decline', 'travel', 'arrive', 'check-in', 'complete', 'no-show') then
    raise exception 'invalid professional booking action' using errcode = '22023';
  end if;
  if p_travel_fee is not null and p_action <> 'accept' then
    raise exception 'a travel fee can only be set when accepting a booking' using errcode = '22023';
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

  -- The travel fee is validated against the cap that is current *now*, inside
  -- this transaction, so an administrator change applies to the next accept.
  accepted_travel_fee := booking.travel_fee;
  if p_action = 'accept' and p_travel_fee is not null then
    select value_integer into travel_fee_cap
    from public.platform_settings where key = 'travel_fee_cap_etb';
    if p_travel_fee < 0
      or p_travel_fee <> trunc(p_travel_fee)
      or p_travel_fee > coalesce(travel_fee_cap, 0)
    then return 'invalid_travel_fee'; end if;
    accepted_travel_fee := p_travel_fee;
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
      travel_fee = case when p_action = 'accept' then accepted_travel_fee else travel_fee end,
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
  elsif p_action = 'accept' then
    -- Read the stored total back so the event always matches the generated column.
    select total into accepted_total from public.bookings where id = booking.id;
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      booking_event_type, 1, 'booking', booking.id::text, booking.version + 1,
      p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
      jsonb_build_object(
        'clientId', booking.client_id, 'professionalId', p_professional_id,
        'travelFee', accepted_travel_fee,
        'total', accepted_total
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

-- 6. Privileges are unchanged: trusted API only.
revoke all on function public.quote_marketplace_booking(jsonb) from public, anon, authenticated;
revoke all on function public.commit_marketplace_booking(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;

grant execute on function public.quote_marketplace_booking(jsonb) to service_role;
grant execute on function public.commit_marketplace_booking(jsonb, jsonb) to service_role;
grant execute on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) to service_role;

commit;

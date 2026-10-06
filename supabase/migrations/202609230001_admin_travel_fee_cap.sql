begin;

-- ---------------------------------------------------------------------------
-- Professional-set travel fee with an administrator-managed cap.
--
-- Flow: the client requests a booking with no travel fee; the professional
-- sees the address and, when accepting, names the travel fee for that trip.
-- The database is the single authority on the maximum a professional may set:
-- `platform_settings.travel_fee_cap_etb`, editable from the operations
-- console. Every accept path (Node API → Supabase RPC) is validated here so
-- no client or backend build can bypass the cap.
-- ---------------------------------------------------------------------------

-- 1. The cap lives beside the commission rate. Default: ETB 500.
insert into public.platform_settings (key, value_integer)
values ('travel_fee_cap_etb', 500)
on conflict (key) do nothing;

-- 2. Administrator settings projection now carries both platform-wide rules.
create or replace function public.get_admin_platform_settings()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'commissionRateBps', commission.value_integer,
    'commissionRatePercent', commission.value_integer / 100.0,
    'travelFeeCap', travel_cap.value_integer,
    'updatedAt', greatest(commission.updated_at, travel_cap.updated_at)
  )
  from public.platform_settings commission
  join public.platform_settings travel_cap on travel_cap.key = 'travel_fee_cap_etb'
  where commission.key = 'commission_rate_bps';
$$;

-- 3. Commission updates return the full settings document so the console
--    never sees a partial settings object.
create or replace function public.update_admin_commission(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_commission_rate_bps integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_commission_rate_bps < 0 or p_commission_rate_bps > 5000 then raise exception 'invalid commission rate'; end if;
  update public.platform_settings set value_integer = p_commission_rate_bps, updated_at = p_occurred_at
  where key = 'commission_rate_bps';
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'commission_rate.updated', 'platform_setting', 'commission_rate_bps',
    jsonb_build_object('commissionRateBps', p_commission_rate_bps), p_occurred_at);
  return public.get_admin_platform_settings();
end;
$$;

-- 4. Administrators change the cap whenever they need to; every change is audited.
create or replace function public.update_admin_travel_fee_cap(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_travel_fee_cap integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_travel_fee_cap is null or p_travel_fee_cap < 0 or p_travel_fee_cap > 100000
  then raise exception 'invalid travel fee cap' using errcode = '22023'; end if;
  update public.platform_settings set value_integer = p_travel_fee_cap, updated_at = p_occurred_at
  where key = 'travel_fee_cap_etb';
  if not found then
    insert into public.platform_settings (key, value_integer, updated_at)
    values ('travel_fee_cap_etb', p_travel_fee_cap, p_occurred_at);
  end if;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'travel_fee_cap.updated', 'platform_setting', 'travel_fee_cap_etb',
    jsonb_build_object('travelFeeCap', p_travel_fee_cap), p_occurred_at);
  return public.get_admin_platform_settings();
end;
$$;

-- 5. Booking quotes no longer pre-charge the zone's travel fee and no longer
--    require the professional to have pre-selected the zone: the professional
--    sees the address on the request and decides whether to travel, then names
--    the fee on acceptance. Any active zone is bookable.
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
  return jsonb_build_object(
    'serviceName', service_record.name,
    'addressZone', zone_record.name,
    'servicePrice', service_record.price,
    'travelFee', 0,
    'total', service_record.price,
    'commissionRateBps', commission
  );
end;
$$;

-- 6. Professional booking transitions accept an optional travel fee on
--    `accept`. The fee is validated against the live cap inside the same
--    transaction that flips the booking to `accepted`; `bookings.total` is a
--    generated column, so checkout automatically charges the new total.
drop function if exists public.transition_professional_booking(uuid, uuid, text, timestamptz);

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
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      booking_event_type, 1, 'booking', booking.id::text, booking.version + 1,
      p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
      jsonb_build_object(
        'clientId', booking.client_id, 'professionalId', p_professional_id,
        'travelFee', accepted_travel_fee,
        'total', booking.service_price + accepted_travel_fee
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

-- 7. The professional dashboard's `travelFeeCap` field is defined in
--    202609230004_restore_split_payment_projections.sql, which holds the single
--    latest body of that projection.

-- 8. Privileges: these commands are only reachable through the trusted API.
revoke all on function public.get_admin_platform_settings() from public, anon, authenticated;
revoke all on function public.update_admin_commission(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.update_admin_travel_fee_cap(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.quote_marketplace_booking(jsonb) from public, anon, authenticated;
revoke all on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;

grant execute on function public.get_admin_platform_settings() to service_role;
grant execute on function public.update_admin_commission(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.update_admin_travel_fee_cap(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.quote_marketplace_booking(jsonb) to service_role;
grant execute on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) to service_role;

commit;

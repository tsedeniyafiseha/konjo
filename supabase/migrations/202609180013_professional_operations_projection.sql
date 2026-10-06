begin;

create or replace function private.professional_catalog_api(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.application_service_reference,
        'category', category.name,
        'name', service.name,
        'durationMinutes', service.duration_minutes,
        'price', service.price,
        'note', service.note,
        'popular', service.popular
      ) order by service.created_at, service.id)
      from public.professional_services service
      join public.service_categories category on category.id = service.category_id
      where service.professional_id = p_professional_id and service.active
    ), '[]'::jsonb),
    'workingDays', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', case hours.weekday
          when 0 then 'Sunday' when 1 then 'Monday' when 2 then 'Tuesday'
          when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday'
          else 'Saturday' end,
        'hours', hours.display_hours,
        'enabled', hours.enabled
      ) order by case when hours.weekday = 0 then 7 else hours.weekday end)
      from public.professional_working_hours hours
      where hours.professional_id = p_professional_id
    ), '[]'::jsonb),
    'travelZones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', zone.slug,
        'label', zone.name,
        'active', travel.active
      ) order by zone.name)
      from public.professional_travel_zones travel
      join public.zones zone on zone.id = travel.zone_id
      where travel.professional_id = p_professional_id
    ), '[]'::jsonb),
    'sameDayBookings', application.same_day_bookings
  )
  from public.professional_applications application
  join public.professional_profiles profile
    on profile.professional_id = application.professional_id
  where application.professional_id = p_professional_id
    and application.status = 'approved'
    and profile.approval_status = 'approved'
    and not profile.is_hidden;
$$;

create or replace function public.get_professional_dashboard(
  p_professional_id uuid,
  p_earnings_since timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', booking.id,
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
        'status', booking.status::text,
        'startedAt', booking.started_at,
        'completedAt', booking.completed_at
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
$$;

create or replace function public.get_professional_catalog_settings(p_professional_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.professional_catalog_api(p_professional_id);
$$;

create or replace function public.list_professional_payouts(p_professional_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', payout.id,
    'professionalId', payout.professional_id,
    'status', payout.status::text,
    'amount', payout.amount,
    'bookingCount', payout.booking_count,
    'createdAt', payout.created_at,
    'paidAt', payout.paid_at
  ) order by payout.created_at desc), '[]'::jsonb)
  from public.payout_batches payout
  where payout.professional_id = p_professional_id;
$$;

create or replace function public.update_professional_catalog(
  p_professional_id uuid,
  p_settings jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  service_item jsonb;
  day_item jsonb;
  zone_item jsonb;
  v_category_id uuid;
  v_zone_id uuid;
begin
  if not exists (
    select 1
    from public.professional_profiles profile
    join public.professional_applications application
      on application.professional_id = profile.professional_id
    where profile.professional_id = p_professional_id
      and profile.approval_status = 'approved'
      and application.status = 'approved'
      and not profile.is_hidden
  ) then
    return jsonb_build_object('result', 'not_found');
  end if;

  if coalesce(jsonb_array_length(p_settings -> 'services'), 0) not between 1 and 20
    or coalesce(jsonb_array_length(p_settings -> 'workingDays'), 0) not between 1 and 7
    or coalesce(jsonb_array_length(p_settings -> 'travelZones'), 0) not between 1 and 20
  then
    raise exception 'professional catalog payload is incomplete' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_settings -> 'travelZones') item
    where not exists (
      select 1 from public.zones zone
      where zone.slug = item ->> 'id' and zone.active
    )
  ) then
    return jsonb_build_object('result', 'invalid_zone');
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_settings -> 'services') item
    where not exists (
      select 1 from public.service_categories category
      where category.slug = lower(trim(item ->> 'category')) and category.active
    )
  ) then
    raise exception 'service category is not available' using errcode = '22023';
  end if;

  update public.professional_services
  set active = false, updated_at = p_occurred_at
  where professional_id = p_professional_id;

  for service_item in select value from jsonb_array_elements(p_settings -> 'services') loop
    select id into v_category_id from public.service_categories
    where slug = lower(trim(service_item ->> 'category')) and active;

    update public.professional_services set
      category_id = v_category_id,
      name = trim(service_item ->> 'name'),
      duration_minutes = (service_item ->> 'durationMinutes')::integer,
      price = (service_item ->> 'price')::numeric,
      note = coalesce(service_item ->> 'note', ''),
      popular = coalesce((service_item ->> 'popular')::boolean, false),
      active = true,
      updated_at = p_occurred_at
    where professional_id = p_professional_id
      and application_service_reference = service_item ->> 'id';

    if not found then
      insert into public.professional_services (
        professional_id, application_service_reference, category_id, name,
        duration_minutes, price, note, popular, active, created_at, updated_at
      ) values (
        p_professional_id,
        service_item ->> 'id',
        v_category_id,
        trim(service_item ->> 'name'),
        (service_item ->> 'durationMinutes')::integer,
        (service_item ->> 'price')::numeric,
        coalesce(service_item ->> 'note', ''),
        coalesce((service_item ->> 'popular')::boolean, false),
        true,
        p_occurred_at,
        p_occurred_at
      );
    end if;
  end loop;

  delete from public.professional_working_hours
  where professional_id = p_professional_id;
  for day_item in select value from jsonb_array_elements(p_settings -> 'workingDays') loop
    insert into public.professional_working_hours (
      professional_id, weekday, enabled, starts_at, ends_at, display_hours
    ) values (
      p_professional_id,
      (day_item ->> 'weekday')::smallint,
      (day_item ->> 'enabled')::boolean,
      nullif(day_item ->> 'startsAt', '')::time,
      nullif(day_item ->> 'endsAt', '')::time,
      day_item ->> 'hours'
    );
  end loop;

  delete from public.professional_travel_zones
  where professional_id = p_professional_id;
  for zone_item in select value from jsonb_array_elements(p_settings -> 'travelZones') loop
    select id into v_zone_id from public.zones
    where slug = zone_item ->> 'id' and active;
    insert into public.professional_travel_zones (professional_id, zone_id, active)
    values (p_professional_id, v_zone_id, (zone_item ->> 'active')::boolean);
  end loop;

  update public.professional_applications
  set same_day_bookings = (p_settings ->> 'sameDayBookings')::boolean,
      updated_at = p_occurred_at
  where professional_id = p_professional_id;

  return jsonb_build_object(
    'result', 'updated',
    'settings', private.professional_catalog_api(p_professional_id)
  );
end;
$$;

create or replace function public.set_professional_availability(
  p_professional_id uuid,
  p_available boolean,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.professional_profiles
  set is_available = p_available, updated_at = p_occurred_at
  where professional_id = p_professional_id
    and approval_status = 'approved'
    and not is_hidden;
  return found;
end;
$$;

create or replace function public.transition_professional_booking(
  p_professional_id uuid,
  p_booking_id uuid,
  p_action text,
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
  target_status public.booking_status;
  source_status public.booking_status;
  booking_event_type text;
  cancellation_policy text;
  commission_amount numeric(12, 2);
  professional_amount numeric(12, 2);
  retained_amount numeric(12, 2);
  refund_amount numeric(12, 2);
begin
  if p_action not in ('accept', 'decline', 'travel', 'check-in', 'complete', 'no-show') then
    raise exception 'invalid professional booking action' using errcode = '22023';
  end if;

  select * into booking from public.bookings
  where id = p_booking_id and professional_id = p_professional_id
  for update;
  if not found then return 'not_found'; end if;

  select * into payment from public.payment_intents
  where booking_id = p_booking_id
  for update;

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
      status = target_status, version = version + 1, updated_at = p_occurred_at
    where id = p_booking_id and version = booking.version;
  end if;
  if not found then return 'invalid_transition'; end if;

  commission_amount := round(booking.service_price * booking.commission_rate_bps / 10000);

  if p_action in ('decline', 'no-show') and payment.id is not null and payment.status <> 'refunded' then
    if payment.status = 'cash_collected' then
      raise exception 'collected cash cannot be refunded automatically';
    end if;
    if p_action = 'no-show' then
      professional_amount := booking.travel_fee;
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

  if p_action = 'complete' then
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
$$;

revoke all on function private.professional_catalog_api(uuid)
  from public, anon, authenticated;
revoke all on function public.get_professional_dashboard(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_professional_catalog_settings(uuid)
  from public, anon, authenticated;
revoke all on function public.list_professional_payouts(uuid)
  from public, anon, authenticated;
revoke all on function public.update_professional_catalog(uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.set_professional_availability(uuid, boolean, timestamptz)
  from public, anon, authenticated;
revoke all on function public.transition_professional_booking(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function private.professional_catalog_api(uuid) to service_role;
grant execute on function public.get_professional_dashboard(uuid, timestamptz) to service_role;
grant execute on function public.get_professional_catalog_settings(uuid) to service_role;
grant execute on function public.list_professional_payouts(uuid) to service_role;
grant execute on function public.update_professional_catalog(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.set_professional_availability(uuid, boolean, timestamptz) to service_role;
grant execute on function public.transition_professional_booking(uuid, uuid, text, timestamptz) to service_role;

commit;

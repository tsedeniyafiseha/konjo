begin;

-- ---------------------------------------------------------------------------
-- 1. Online payments: keep the provider checkout URL so the client app can open
--    the Chapa checkout page (and reopen it later) after the professional accepts.
-- ---------------------------------------------------------------------------
alter table public.payment_intents
  add column if not exists checkout_url text
  check (checkout_url is null or checkout_url ~ '^https://');

create or replace function private.payment_intent_api(p_payment_intent_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', payment.id,
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
$$;

create or replace function public.commit_booking_payment_intent(
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
  checkout_url text := nullif(trim(coalesce(p_provider_intent ->> 'checkoutUrl', '')), '');
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
    amount, refunded_amount, version, currency, checkout_url, created_at, updated_at
  ) values (
    payment_id, booking.id, booking.client_id, booking.payment_method,
    provider_reference, provider_status, booking.total, 0, 1, 'ETB', checkout_url,
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

-- ---------------------------------------------------------------------------
-- 2. Client addresses carry consented coordinates ("use my current location").
-- ---------------------------------------------------------------------------
create or replace function private.client_address_api(p_address_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', address.id,
    'label', address.label,
    'zone', zone.name,
    'detail', address.address_detail,
    'fee', zone.travel_fee,
    'isDefault', address.is_default,
    'latitude', address.latitude,
    'longitude', address.longitude,
    'createdAt', address.created_at
  )
  from public.client_addresses address
  join public.zones zone on zone.id = address.zone_id
  where address.id = p_address_id;
$$;

drop function if exists public.create_client_address(uuid, uuid, text, text, text, boolean, timestamptz);
create function public.create_client_address(
  p_client_id uuid,
  p_address_id uuid,
  p_label text,
  p_zone text,
  p_detail text,
  p_make_default boolean,
  p_occurred_at timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_zone_id uuid;
  v_default boolean;
begin
  perform 1 from public.profiles
  where user_id = p_client_id and account_role = 'client'
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'latitude and longitude must be provided together' using errcode = '22023';
  end if;
  select id into v_zone_id from public.zones
  where lower(name) = lower(trim(p_zone)) and active;
  if v_zone_id is null then
    return jsonb_build_object('result', 'service_zone_unavailable');
  end if;
  v_default := p_make_default or not exists (
    select 1 from public.client_addresses where client_id = p_client_id
  );
  if v_default then
    update public.client_addresses set is_default = false, updated_at = p_occurred_at
    where client_id = p_client_id and is_default;
  end if;
  insert into public.client_addresses (
    id, client_id, label, zone_id, address_detail, is_default, latitude, longitude, created_at, updated_at
  ) values (
    p_address_id, p_client_id, trim(p_label), v_zone_id, trim(p_detail),
    v_default, p_latitude, p_longitude, p_occurred_at, p_occurred_at
  );
  return jsonb_build_object('result', 'updated', 'address', private.client_address_api(p_address_id));
end;
$$;

drop function if exists public.update_client_address(uuid, uuid, text, text, text, timestamptz);
create function public.update_client_address(
  p_client_id uuid,
  p_address_id uuid,
  p_label text,
  p_zone text,
  p_detail text,
  p_occurred_at timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_zone_id uuid;
begin
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'latitude and longitude must be provided together' using errcode = '22023';
  end if;
  select id into v_zone_id from public.zones
  where lower(name) = lower(trim(p_zone)) and active;
  if v_zone_id is null then
    return jsonb_build_object('result', 'service_zone_unavailable');
  end if;
  update public.client_addresses set
    label = trim(p_label), zone_id = v_zone_id,
    address_detail = trim(p_detail),
    -- A new capture replaces the pin; an edit without one keeps the saved pin.
    latitude = coalesce(p_latitude, latitude),
    longitude = coalesce(p_longitude, longitude),
    updated_at = p_occurred_at
  where id = p_address_id and client_id = p_client_id;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object('result', 'updated', 'address', private.client_address_api(p_address_id));
end;
$$;

revoke all on function public.create_client_address(uuid, uuid, text, text, text, boolean, timestamptz, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.update_client_address(uuid, uuid, text, text, text, timestamptz, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.create_client_address(uuid, uuid, text, text, text, boolean, timestamptz, double precision, double precision)
  to service_role;
grant execute on function public.update_client_address(uuid, uuid, text, text, text, timestamptz, double precision, double precision)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Live tracking: one row per booking holding the professional's latest
--    position while they travel and work. Clients subscribe through Realtime.
-- ---------------------------------------------------------------------------
create table if not exists public.booking_tracking (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  professional_id uuid not null references public.profiles (user_id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading double precision check (heading is null or heading between 0 and 360),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.booking_tracking enable row level security;
alter table public.booking_tracking replica identity full;

drop policy if exists booking_tracking_participant_read on public.booking_tracking;
create policy booking_tracking_participant_read on public.booking_tracking
for select to authenticated using (
  exists (
    select 1 from public.bookings booking
    where booking.id = booking_tracking.booking_id
      and (booking.client_id = (select auth.uid()) or booking.professional_id = (select auth.uid()))
  ) or private.is_admin()
);
grant select on public.booking_tracking to authenticated;
revoke insert, update, delete on public.booking_tracking from authenticated, anon;

create or replace function private.booking_tracking_api(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'latitude', tracking.latitude,
    'longitude', tracking.longitude,
    'accuracyMeters', tracking.accuracy_meters,
    'heading', tracking.heading,
    'speedMps', tracking.speed_mps,
    'recordedAt', tracking.recorded_at
  )
  from public.booking_tracking tracking
  where tracking.booking_id = p_booking_id;
$$;
revoke all on function private.booking_tracking_api(uuid) from public, anon, authenticated;
grant execute on function private.booking_tracking_api(uuid) to service_role;

-- Only the assigned professional, only while en route or on site.
create or replace function public.record_booking_location(
  p_professional_id uuid,
  p_booking_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_heading double precision,
  p_speed_mps double precision,
  p_recorded_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking_status public.booking_status;
begin
  select booking.status into booking_status
  from public.bookings booking
  where booking.id = p_booking_id and booking.professional_id = p_professional_id;
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
$$;

-- Polling fallback for clients (and the professional) when Realtime is unavailable.
create or replace function public.get_booking_tracking(p_user_id uuid, p_booking_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when exists (
    select 1 from public.bookings booking
    where booking.id = p_booking_id
      and (booking.client_id = p_user_id or booking.professional_id = p_user_id)
  ) then coalesce(private.booking_tracking_api(p_booking_id), 'null'::jsonb) else null end;
$$;

revoke all on function public.record_booking_location(uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_booking_tracking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_booking_location(uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz)
  to service_role;
grant execute on function public.get_booking_tracking(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Bookings: copy the address pin at booking time, expose who cancelled (so a
--    professional decline is distinguishable from a client cancellation) and the
--    latest tracking point.
-- ---------------------------------------------------------------------------
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
    v_latitude,
    v_longitude,
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
$$;

-- ---------------------------------------------------------------------------
-- 5. Professional dashboard jobs carry the client pin so the professional can
--    navigate, plus the client id for tracking ownership checks.
-- ---------------------------------------------------------------------------
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
$$;

-- ---------------------------------------------------------------------------
-- 6. In-app notification inbox: the outbox row is the inbox record. Keep the
--    payload (booking id, status) so the app can render and deep-link it, and
--    let the owner mark records as read. Realtime delivers new rows instantly.
-- ---------------------------------------------------------------------------
alter table public.notification_outbox
  add column if not exists read_at timestamptz;

create or replace function public.list_client_notifications(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', notification.id,
    'channel', notification.channel,
    'template', notification.template,
    'status', notification.status,
    'attempts', notification.attempts,
    'payload', notification.payload,
    'readAt', notification.read_at,
    'createdAt', notification.created_at
  ) order by notification.created_at desc), '[]'::jsonb)
  from (
    select * from public.notification_outbox
    where user_id = p_client_id order by created_at desc limit 50
  ) notification;
$$;

create or replace function public.mark_my_notifications_read(p_notification_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.notification_outbox
  set read_at = coalesce(read_at, now()), updated_at = now()
  where user_id = auth.uid() and id = any (p_notification_ids) and read_at is null;
  get diagnostics updated = row_count;
  return updated;
end;
$$;
revoke all on function public.mark_my_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_my_notifications_read(uuid[]) to authenticated;
grant select on public.notification_outbox to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_tracking'
  ) then
    alter publication supabase_realtime add table public.booking_tracking;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_outbox'
  ) then
    alter publication supabase_realtime add table public.notification_outbox;
  end if;
end;
$$;

commit;

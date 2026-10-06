begin;

create or replace function private.booking_scheduled_start(p_date date, p_time text)
returns timestamptz
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  parsed_time time;
begin
  parsed_time := case trim(p_time)
    when '9:00 AM' then time '09:00'
    when '10:30 AM' then time '10:30'
    when '12:00 PM' then time '12:00'
    when '2:30 PM' then time '14:30'
    when '4:00 PM' then time '16:00'
    when '5:30 PM' then time '17:30'
    else null end;
  if parsed_time is null then
    raise exception 'unsupported booking time' using errcode = '22023';
  end if;
  return (p_date + parsed_time) at time zone 'Africa/Addis_Ababa';
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
    'createdAt', booking.created_at
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
    'createdAt', payment.created_at,
    'updatedAt', payment.updated_at
  )
  from public.payment_intents payment
  where payment.id = p_payment_intent_id;
$$;

revoke all on function private.booking_scheduled_start(date, text)
  from public, anon, authenticated;
revoke all on function private.booking_api(uuid)
  from public, anon, authenticated;
revoke all on function private.payment_intent_api(uuid)
  from public, anon, authenticated;
grant execute on function private.booking_scheduled_start(date, text) to service_role;
grant execute on function private.booking_api(uuid) to service_role;
grant execute on function private.payment_intent_api(uuid) to service_role;

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

  select zone.id, zone.name, zone.travel_fee into zone_record
  from public.zones zone
  join public.professional_travel_zones travel on travel.zone_id = zone.id
  where travel.professional_id = v_professional_id
    and travel.active and zone.active
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
    'travelFee', zone_record.travel_fee,
    'total', service_record.price + zone_record.travel_fee,
    'commissionRateBps', commission
  );
end;
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
    'paymentIntent', private.payment_intent_api(payment.id),
    'duplicate', true
  )
  from public.bookings booking
  join public.payment_intents payment on payment.booking_id = booking.id
  where booking.client_id = p_client_id
    and booking.client_request_id = p_request_id;
$$;

create or replace function public.commit_marketplace_booking(
  p_input jsonb,
  p_quote jsonb,
  p_provider_intent jsonb
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
  payment_id uuid := extensions.gen_random_uuid();
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

  insert into public.payment_intents (
    id, booking_id, client_id, provider, provider_reference, status,
    amount, refunded_amount, version, currency, created_at, updated_at
  ) values (
    payment_id,
    booking_id,
    v_client_id,
    (p_input ->> 'paymentMethod')::public.booking_payment_method,
    p_provider_intent ->> 'providerReference',
    (p_provider_intent ->> 'status')::public.payment_status,
    (p_quote ->> 'total')::numeric,
    0,
    1,
    'ETB',
    occurred_at,
    occurred_at
  );

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
    'paymentIntent', private.payment_intent_api(payment_id),
    'duplicate', false
  );
exception
  when unique_violation then
    return public.find_marketplace_booking_by_request(v_client_id, request_id);
end;
$$;

create or replace function public.list_client_bookings(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.booking_api(booking.id)
    order by booking.created_at desc), '[]'::jsonb)
  from public.bookings booking
  where booking.client_id = p_client_id;
$$;

create or replace function public.get_client_payment_intent(
  p_client_id uuid,
  p_payment_intent_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.payment_intent_api(payment.id)
  from public.payment_intents payment
  where payment.client_id = p_client_id and payment.id = p_payment_intent_id;
$$;

revoke all on function public.quote_marketplace_booking(jsonb)
  from public, anon, authenticated;
revoke all on function public.find_marketplace_booking_by_request(uuid, text)
  from public, anon, authenticated;
revoke all on function public.commit_marketplace_booking(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.list_client_bookings(uuid)
  from public, anon, authenticated;
revoke all on function public.get_client_payment_intent(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.quote_marketplace_booking(jsonb) to service_role;
grant execute on function public.find_marketplace_booking_by_request(uuid, text) to service_role;
grant execute on function public.commit_marketplace_booking(jsonb, jsonb, jsonb) to service_role;
grant execute on function public.list_client_bookings(uuid) to service_role;
grant execute on function public.get_client_payment_intent(uuid, uuid) to service_role;

commit;

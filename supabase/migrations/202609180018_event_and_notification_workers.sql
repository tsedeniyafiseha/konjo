begin;

create or replace function public.enqueue_notification(
  p_user_id uuid,
  p_idempotency_key text,
  p_channel text,
  p_template text,
  p_payload jsonb,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    return false;
  end if;
  insert into public.notification_outbox (
    idempotency_key, user_id, channel, template, payload,
    status, attempts, next_attempt_at, created_at, updated_at
  ) values (
    p_idempotency_key, p_user_id, p_channel, p_template, p_payload,
    'pending', 0, p_now, p_now, p_now
  ) on conflict (idempotency_key) do nothing;
  return found;
end;
$$;

create or replace function public.claim_domain_events(
  p_worker_id text,
  p_now timestamptz,
  p_locked_until timestamptz,
  p_limit integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select event.event_id
    from public.domain_event_outbox event
    where (event.status = 'pending' and event.available_at <= p_now)
       or (event.status = 'processing' and event.locked_until <= p_now)
    order by event.occurred_at, event.aggregate_type, event.aggregate_id,
      event.aggregate_version, event.event_id
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.domain_event_outbox event set
      status = 'processing', attempts = event.attempts + 1,
      locked_by = p_worker_id, locked_until = p_locked_until,
      last_error = null
    from candidates where event.event_id = candidates.event_id
    returning event.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', claimed.event_id,
    'eventType', claimed.event_type,
    'schemaVersion', claimed.schema_version,
    'aggregateType', claimed.aggregate_type,
    'aggregateId', claimed.aggregate_id,
    'aggregateVersion', claimed.aggregate_version,
    'occurredAt', claimed.occurred_at,
    'correlationId', claimed.correlation_id,
    'causationId', claimed.causation_id,
    'payload', claimed.payload,
    'attempt', claimed.attempts
  ) order by claimed.occurred_at, claimed.aggregate_type, claimed.aggregate_id,
    claimed.aggregate_version, claimed.event_id), '[]'::jsonb)
  from claimed;
$$;

create or replace function public.mark_domain_event_processed(
  p_event_id uuid,
  p_worker_id text,
  p_processed_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.domain_event_outbox set
    status = 'processed', processed_at = p_processed_at,
    locked_by = null, locked_until = null, last_error = null
  where event_id = p_event_id and status = 'processing' and locked_by = p_worker_id;
  return found;
end;
$$;

create or replace function public.record_domain_event_failure(
  p_event_id uuid,
  p_worker_id text,
  p_failed_at timestamptz,
  p_available_at timestamptz,
  p_error_message text,
  p_terminal boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.domain_event_outbox set
    status = case when p_terminal then 'failed' else 'pending' end,
    available_at = p_available_at,
    locked_by = null,
    locked_until = null,
    last_error = left(p_error_message, 2000),
    processed_at = case when p_terminal then p_failed_at else null end
  where event_id = p_event_id and status = 'processing' and locked_by = p_worker_id;
  return found;
end;
$$;

create or replace function public.list_failed_domain_events(p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', event.event_id,
    'eventType', event.event_type,
    'schemaVersion', event.schema_version,
    'aggregateType', event.aggregate_type,
    'aggregateId', event.aggregate_id,
    'aggregateVersion', event.aggregate_version,
    'occurredAt', event.occurred_at,
    'correlationId', event.correlation_id,
    'causationId', event.causation_id,
    'attempts', event.attempts,
    'lastError', event.last_error,
    'failedAt', event.processed_at
  ) order by event.processed_at desc, event.occurred_at desc, event.event_id), '[]'::jsonb)
  from (
    select * from public.domain_event_outbox
    where status = 'failed'
    order by processed_at desc, occurred_at desc, event_id
    limit greatest(1, least(p_limit, 100))
  ) event;
$$;

create or replace function public.replay_failed_domain_event(
  p_event_id uuid,
  p_admin_id uuid,
  p_requested_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event public.domain_event_outbox%rowtype;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin'
  ) then raise exception 'administrator role required' using errcode = '42501'; end if;
  select * into event from public.domain_event_outbox where event_id = p_event_id for update;
  if not found then return 'not_found'; end if;
  if event.status <> 'failed' then return 'not_failed'; end if;
  update public.domain_event_outbox set
    status = 'pending', attempts = 0, available_at = p_requested_at,
    locked_by = null, locked_until = null, last_error = null, processed_at = null
  where event_id = p_event_id;
  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, metadata, created_at
  ) values (
    p_admin_id, 'domain_event.replayed', 'domain_event', p_event_id::text,
    jsonb_build_object(
      'eventType', event.event_type, 'aggregateType', event.aggregate_type,
      'aggregateId', event.aggregate_id, 'previousAttempts', event.attempts,
      'previousError', event.last_error
    ), p_requested_at
  );
  return 'replayed';
end;
$$;

create or replace function public.reassign_overdue_bookings(p_now timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  candidate record;
  v_category_id uuid;
  slot_label text;
  next_assignment integer;
  result jsonb := '[]'::jsonb;
begin
  for booking in
    select * from public.bookings
    where status = 'requested' and accept_by <= p_now
    order by accept_by
    for update skip locked
  loop
    select service.category_id into v_category_id
    from public.professional_services service where service.id = booking.service_id;
    slot_label := trim(to_char(booking.scheduled_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM'));
    select profile.professional_id, service.id into candidate
    from public.professional_profiles profile
    join public.professional_services service
      on service.professional_id = profile.professional_id
     and service.category_id = v_category_id
     and service.active
     and lower(service.name) = lower(booking.service_name)
     and service.price = booking.service_price
    join public.professional_travel_zones travel
      on travel.professional_id = profile.professional_id and travel.active
    join public.zones zone on zone.id = travel.zone_id and zone.active
    cross join lateral (
      select private.professional_availability_api(
        profile.professional_id,
        (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date,
        service.id::text,
        null
      ) as value
    ) availability
    where profile.approval_status = 'approved'
      and not profile.is_hidden and profile.is_available
      and lower(zone.name) = lower(booking.address_zone)
      and (not booking.female_only or profile.female_only_eligible)
      and not exists (
        select 1 from public.booking_assignments assignment
        where assignment.booking_id = booking.id
          and assignment.professional_id = profile.professional_id
      )
      and coalesce(availability.value -> 'slots', '[]'::jsonb) ? slot_label
    order by profile.featured desc, profile.average_rating desc nulls last,
      profile.review_count desc, profile.professional_id
    limit 1;

    if not found then
      update public.bookings set accept_by = p_now + interval '5 minutes', updated_at = p_now
      where id = booking.id;
      continue;
    end if;

    next_assignment := booking.assignment_version + 1;
    update public.bookings set
      professional_id = candidate.professional_id,
      service_id = candidate.id,
      assignment_version = next_assignment,
      accept_by = p_now + interval '15 minutes',
      version = version + 1,
      updated_at = p_now
    where id = booking.id and status = 'requested' and version = booking.version;
    if not found then continue; end if;
    insert into public.booking_assignments (
      booking_id, professional_id, assignment_version, assigned_at
    ) values (booking.id, candidate.professional_id, next_assignment, p_now);
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      'BookingReassigned', 1, 'booking', booking.id::text, booking.version + 1,
      p_now, coalesce(booking.client_request_id, booking.id::text),
      jsonb_build_object(
        'clientId', booking.client_id,
        'previousProfessionalId', booking.professional_id,
        'professionalId', candidate.professional_id,
        'assignmentVersion', next_assignment
      )
    );
    result := result || jsonb_build_array(jsonb_build_object(
      'bookingId', booking.id, 'professionalId', candidate.professional_id
    ));
  end loop;
  return result;
end;
$$;

create or replace function public.enqueue_due_booking_reminders(p_now timestamptz)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking record;
  created integer := 0;
begin
  for booking in
    select id, client_id, professional_id, scheduled_start
    from public.bookings
    where status = 'accepted'
      and scheduled_start >= p_now
      and scheduled_start <= p_now + interval '24 hours'
    order by scheduled_start
  loop
    insert into public.notification_outbox (
      idempotency_key, user_id, channel, template, payload,
      status, attempts, next_attempt_at, created_at, updated_at
    ) values (
      'booking:' || booking.id || ':client:reminder:24h', booking.client_id,
      'push', 'booking_reminder', jsonb_build_object(
        'bookingId', booking.id,
        'dateIso', (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date::text,
        'time', trim(to_char(booking.scheduled_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM'))
      ), 'pending', 0, p_now, p_now, p_now
    ) on conflict (idempotency_key) do nothing;
    if found then created := created + 1; end if;
    insert into public.notification_outbox (
      idempotency_key, user_id, channel, template, payload,
      status, attempts, next_attempt_at, created_at, updated_at
    ) values (
      'booking:' || booking.id || ':professional:reminder:24h', booking.professional_id,
      'push', 'booking_reminder', jsonb_build_object(
        'bookingId', booking.id,
        'dateIso', (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date::text,
        'time', trim(to_char(booking.scheduled_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM'))
      ), 'pending', 0, p_now, p_now, p_now
    ) on conflict (idempotency_key) do nothing;
    if found then created := created + 1; end if;
  end loop;
  return created;
end;
$$;

create or replace function public.claim_due_notification_jobs(
  p_now timestamptz,
  p_limit integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select notification.id from public.notification_outbox notification
    where notification.status = 'pending' and notification.next_attempt_at <= p_now
    order by notification.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.notification_outbox notification
    set next_attempt_at = p_now + interval '5 minutes', updated_at = p_now
    from due where notification.id = due.id
    returning notification.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', claimed.id,
    'channel', claimed.channel,
    'template', claimed.template,
    'payload', claimed.payload,
    'destination', case when claimed.channel = 'push' then coalesce((
      select device.token from public.device_registrations device
      where device.user_id = claimed.user_id and device.active
      order by device.updated_at desc limit 1
    ), '') else coalesce(profile.phone_number, '') end,
    'attempt', claimed.attempts + 1
  ) order by claimed.created_at), '[]'::jsonb)
  from claimed
  join public.profiles profile on profile.user_id = claimed.user_id;
$$;

create or replace function public.record_notification_delivery(
  p_job jsonb,
  p_result jsonb,
  p_recorded_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  delivered boolean := (p_result ->> 'delivered')::boolean;
  attempt integer := (p_job ->> 'attempt')::integer;
  terminal boolean;
  next_attempt timestamptz;
begin
  insert into public.notification_deliveries (
    outbox_id, attempt, status, provider_reference, error_message, created_at
  ) values (
    (p_job ->> 'id')::uuid, attempt,
    case when delivered then 'delivered' else 'failed' end,
    nullif(p_result ->> 'providerReference', ''),
    nullif(left(p_result ->> 'errorMessage', 2000), ''),
    p_recorded_at
  ) on conflict (outbox_id, attempt) do nothing;
  terminal := delivered or attempt >= 3;
  next_attempt := p_recorded_at + make_interval(secs => least(60, (2 ^ attempt)::integer));
  update public.notification_outbox set
    status = case when delivered then 'delivered' when terminal then 'failed' else 'pending' end,
    attempts = greatest(attempts, attempt),
    next_attempt_at = next_attempt,
    updated_at = p_recorded_at
  where id = (p_job ->> 'id')::uuid;
end;
$$;

revoke all on function public.enqueue_notification(uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_domain_events(text, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.mark_domain_event_processed(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_domain_event_failure(uuid, text, timestamptz, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function public.list_failed_domain_events(integer) from public, anon, authenticated;
revoke all on function public.replay_failed_domain_event(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reassign_overdue_bookings(timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_due_booking_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.claim_due_notification_jobs(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.record_notification_delivery(jsonb, jsonb, timestamptz) from public, anon, authenticated;

grant execute on function public.enqueue_notification(uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.claim_domain_events(text, timestamptz, timestamptz, integer) to service_role;
grant execute on function public.mark_domain_event_processed(uuid, text, timestamptz) to service_role;
grant execute on function public.record_domain_event_failure(uuid, text, timestamptz, timestamptz, text, boolean) to service_role;
grant execute on function public.list_failed_domain_events(integer) to service_role;
grant execute on function public.replay_failed_domain_event(uuid, uuid, timestamptz) to service_role;
grant execute on function public.reassign_overdue_bookings(timestamptz) to service_role;
grant execute on function public.enqueue_due_booking_reminders(timestamptz) to service_role;
grant execute on function public.claim_due_notification_jobs(timestamptz, integer) to service_role;
grant execute on function public.record_notification_delivery(jsonb, jsonb, timestamptz) to service_role;

commit;

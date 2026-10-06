begin;

create unique index if not exists safety_incidents_one_open_reporter_idx
  on public.safety_incidents (booking_id, reported_by_id)
  where status = 'open';

create or replace function public.open_safety_incident(
  p_incident_id uuid,
  p_user_id uuid,
  p_role public.account_role,
  p_booking_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  incident public.safety_incidents%rowtype;
  counterpart_id uuid;
begin
  select * into booking from public.bookings where id = p_booking_id for update;
  if not found or not (
    (p_role = 'client' and booking.client_id = p_user_id)
    or (p_role = 'professional' and booking.professional_id = p_user_id)
  ) then return jsonb_build_object('result', 'not_found'); end if;
  if booking.status not in ('accepted', 'on_the_way', 'in_progress') then
    return jsonb_build_object('result', 'not_active');
  end if;
  select * into incident from public.safety_incidents
  where booking_id = p_booking_id and reported_by_id = p_user_id and status = 'open'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('result', 'existing', 'incident', jsonb_build_object(
      'id', incident.id, 'bookingId', incident.booking_id,
      'reportedById', incident.reported_by_id, 'reportedByRole', incident.reported_by_role,
      'latitude', incident.latitude, 'longitude', incident.longitude,
      'accuracyMeters', incident.accuracy_meters, 'status', incident.status,
      'resolution', incident.resolution, 'createdAt', incident.created_at,
      'resolvedAt', incident.resolved_at
    ));
  end if;
  begin
    insert into public.safety_incidents (
      id, booking_id, reported_by_id, reported_by_role, latitude, longitude,
      accuracy_meters, status, resolution, created_at
    ) values (
      p_incident_id, p_booking_id, p_user_id, p_role, p_latitude, p_longitude,
      p_accuracy_meters, 'open', '', p_occurred_at
    ) returning * into incident;
  exception when unique_violation then
    select * into incident from public.safety_incidents
    where booking_id = p_booking_id and reported_by_id = p_user_id and status = 'open'
    order by created_at desc limit 1;
    return jsonb_build_object('result', 'existing', 'incident', jsonb_build_object(
      'id', incident.id, 'bookingId', incident.booking_id,
      'reportedById', incident.reported_by_id, 'reportedByRole', incident.reported_by_role,
      'latitude', incident.latitude, 'longitude', incident.longitude,
      'accuracyMeters', incident.accuracy_meters, 'status', incident.status,
      'resolution', incident.resolution, 'createdAt', incident.created_at,
      'resolvedAt', incident.resolved_at
    ));
  end;
  counterpart_id := case when p_role = 'client' then booking.professional_id else booking.client_id end;
  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'SafetyIncidentOpened', 1, 'safety_incident', p_incident_id::text, 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    p_role::text || ':' || p_user_id::text || ':sos',
    jsonb_build_object(
      'bookingId', p_booking_id, 'incidentId', p_incident_id,
      'reportedById', p_user_id, 'reportedByRole', p_role,
      'counterpartId', counterpart_id,
      'coordinatesAvailable', p_latitude is not null and p_longitude is not null
    )
  );
  return jsonb_build_object('result', 'created', 'incident', jsonb_build_object(
    'id', incident.id, 'bookingId', incident.booking_id,
    'reportedById', incident.reported_by_id, 'reportedByRole', incident.reported_by_role,
    'latitude', incident.latitude, 'longitude', incident.longitude,
    'accuracyMeters', incident.accuracy_meters, 'status', incident.status,
    'resolution', incident.resolution, 'createdAt', incident.created_at,
    'resolvedAt', incident.resolved_at
  ));
end;
$$;

create or replace function public.open_booking_dispute(
  p_dispute_id uuid,
  p_client_id uuid,
  p_booking_id uuid,
  p_reason text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare dispute public.booking_disputes%rowtype;
begin
  if not exists (select 1 from public.bookings where id = p_booking_id and client_id = p_client_id) then
    return null;
  end if;
  begin
    insert into public.booking_disputes (
      id, booking_id, client_id, reason, status, resolution, created_at
    ) values (p_dispute_id, p_booking_id, p_client_id, p_reason, 'open', '', p_occurred_at)
    returning * into dispute;
  exception when unique_violation then return null;
  end;
  return jsonb_build_object(
    'id', dispute.id, 'bookingId', dispute.booking_id, 'clientId', dispute.client_id,
    'reason', dispute.reason, 'status', dispute.status, 'resolution', dispute.resolution,
    'createdAt', dispute.created_at, 'resolvedAt', dispute.resolved_at
  );
end;
$$;

create or replace function public.resolve_safety_incident(
  p_audit_id uuid, p_admin_id uuid, p_incident_id uuid,
  p_resolution text, p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare incident public.safety_incidents%rowtype;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  select * into incident from public.safety_incidents
  where id = p_incident_id and status = 'open' for update;
  if not found then return null; end if;
  update public.safety_incidents set status = 'resolved', resolution = p_resolution,
    resolved_at = p_occurred_at where id = p_incident_id returning * into incident;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'safety_incident.resolved', 'safety_incident', p_incident_id::text,
    jsonb_build_object('bookingId', incident.booking_id, 'reportedByRole', incident.reported_by_role), p_occurred_at);
  return jsonb_build_object(
    'id', incident.id, 'bookingId', incident.booking_id,
    'reportedById', incident.reported_by_id, 'reportedByRole', incident.reported_by_role,
    'latitude', incident.latitude, 'longitude', incident.longitude,
    'accuracyMeters', incident.accuracy_meters, 'status', incident.status,
    'resolution', incident.resolution, 'createdAt', incident.created_at,
    'resolvedAt', incident.resolved_at
  );
end;
$$;

create or replace function public.resolve_professional_quality_flag(
  p_audit_id uuid, p_admin_id uuid, p_flag_id uuid, p_resolution text,
  p_action text, p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare flag public.professional_quality_flags%rowtype; professional_name text;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_action not in ('restore', 'keep_hidden') then raise exception 'invalid quality action'; end if;
  select * into flag from public.professional_quality_flags
  where id = p_flag_id and status = 'open' for update;
  if not found then return null; end if;
  update public.professional_quality_flags set status = 'resolved', resolution = p_resolution,
    resolved_at = p_occurred_at where id = p_flag_id returning * into flag;
  if p_action = 'restore' and not exists (
    select 1 from public.professional_quality_flags
    where professional_id = flag.professional_id and status = 'open'
  ) then
    update public.professional_profiles set is_hidden = false, updated_at = p_occurred_at
    where professional_id = flag.professional_id;
  end if;
  select display_name into professional_name from public.professional_profiles
  where professional_id = flag.professional_id;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'professional_quality_flag.resolved', 'professional_quality_flag', p_flag_id::text,
    jsonb_build_object('professionalId', flag.professional_id, 'bookingId', flag.booking_id, 'action', p_action), p_occurred_at);
  return jsonb_build_object(
    'id', flag.id, 'professionalId', flag.professional_id, 'professionalName', professional_name,
    'bookingId', flag.booking_id, 'averageRating', flag.average_rating, 'status', flag.status,
    'resolution', flag.resolution, 'createdAt', flag.created_at, 'resolvedAt', flag.resolved_at
  );
end;
$$;

create or replace function public.resolve_booking_dispute(
  p_audit_id uuid, p_admin_id uuid, p_dispute_id uuid,
  p_status text, p_resolution text, p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare dispute public.booking_disputes%rowtype;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_status not in ('resolved', 'rejected') then raise exception 'invalid dispute status'; end if;
  select * into dispute from public.booking_disputes
  where id = p_dispute_id and status = 'open' for update;
  if not found then return null; end if;
  update public.booking_disputes set status = p_status, resolution = p_resolution,
    resolved_at = p_occurred_at where id = p_dispute_id returning * into dispute;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'dispute.resolved', 'booking_dispute', p_dispute_id::text,
    jsonb_build_object('status', p_status), p_occurred_at);
  return jsonb_build_object(
    'id', dispute.id, 'bookingId', dispute.booking_id, 'clientId', dispute.client_id,
    'reason', dispute.reason, 'status', dispute.status, 'resolution', dispute.resolution,
    'createdAt', dispute.created_at, 'resolvedAt', dispute.resolved_at
  );
end;
$$;

revoke all on function public.open_safety_incident(uuid, uuid, public.account_role, uuid, double precision, double precision, double precision, timestamptz) from public, anon, authenticated;
revoke all on function public.open_booking_dispute(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.resolve_safety_incident(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.resolve_professional_quality_flag(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.resolve_booking_dispute(uuid, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.open_safety_incident(uuid, uuid, public.account_role, uuid, double precision, double precision, double precision, timestamptz) to service_role;
grant execute on function public.open_booking_dispute(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.resolve_safety_incident(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.resolve_professional_quality_flag(uuid, uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.resolve_booking_dispute(uuid, uuid, uuid, text, text, timestamptz) to service_role;

commit;

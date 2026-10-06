begin;

-- Generate the complete local day in half-hour increments. The public wrapper
-- still returns no slots while an accepted/in-flight booking is active; this
-- inner function applies working hours, elapsed-time and collision rules.
create or replace function private.professional_availability_api_without_active_booking(
  p_professional_id uuid,
  p_date date,
  p_service_id text default null,
  p_exclude_booking_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_available boolean;
  day_enabled boolean;
  working_start time;
  working_end time;
  working_start_at timestamptz;
  working_end_at timestamptz;
  requested_duration integer := 60;
  slot_record record;
  slot_start timestamptz;
  slot_end timestamptz;
  slots jsonb := '[]'::jsonb;
begin
  select profile.is_available
  into profile_available
  from public.professional_profiles profile
  where profile.professional_id = p_professional_id
    and profile.approval_status = 'approved'
    and not profile.is_hidden;

  if not found then return null; end if;

  if p_service_id is not null then
    select service.duration_minutes
    into requested_duration
    from public.professional_services service
    where service.professional_id = p_professional_id
      and service.active
      and (
        service.id::text = p_service_id
        or service.application_service_reference = p_service_id
      )
    limit 1;
    if not found then return null; end if;
  end if;

  select hours.enabled, hours.starts_at, hours.ends_at
  into day_enabled, working_start, working_end
  from public.professional_working_hours hours
  where hours.professional_id = p_professional_id
    and hours.weekday = extract(dow from p_date)::smallint;

  if not coalesce(profile_available, false)
    or not coalesce(day_enabled, false)
    or working_start is null
    or working_end is null
    or working_end <= working_start
  then
    return jsonb_build_object(
      'professionalId', p_professional_id,
      'dateIso', p_date::text,
      'available', false,
      'slots', slots
    );
  end if;

  working_start_at := (p_date + working_start) at time zone 'Africa/Addis_Ababa';
  working_end_at := (p_date + working_end) at time zone 'Africa/Addis_Ababa';

  for slot_record in
    select
      trim(to_char((time '00:00' + candidate.slot_index * interval '30 minutes')::time, 'FMHH12:MI AM')) as label,
      (time '00:00' + candidate.slot_index * interval '30 minutes')::time as local_time
    from generate_series(0, 47) as candidate(slot_index)
  loop
    slot_start := (p_date + slot_record.local_time) at time zone 'Africa/Addis_Ababa';
    slot_end := slot_start + make_interval(mins => requested_duration);

    if slot_start < working_start_at
      or slot_end > working_end_at
      or slot_start <= now()
    then
      continue;
    end if;

    if exists (
      select 1 from public.bookings booking
      where booking.professional_id = p_professional_id
        and booking.status <> 'cancelled'
        and (p_exclude_booking_id is null or booking.id::text <> p_exclude_booking_id)
        and booking.scheduled_start < slot_end
        and booking.scheduled_start + make_interval(mins => booking.duration_minutes) > slot_start
    ) then
      continue;
    end if;

    slots := slots || to_jsonb(slot_record.label);
  end loop;

  return jsonb_build_object(
    'professionalId', p_professional_id,
    'dateIso', p_date::text,
    'available', jsonb_array_length(slots) > 0,
    'slots', slots
  );
end;
$$;

revoke all on function private.professional_availability_api_without_active_booking(uuid, date, text, text)
  from public, anon, authenticated;
grant execute on function private.professional_availability_api_without_active_booking(uuid, date, text, text)
  to service_role;

commit;

begin;

-- ---------------------------------------------------------------------------
-- Professionals can take bookings at any hour.
--
-- Working hours no longer narrow the slots a client can pick: every half hour
-- of every day is offered, as long as the professional is marked available,
-- the time has not passed and it does not overlap another booking. The
-- professional still decides by accepting or declining each request. The
-- public wrapper (202609300004) still hides every slot while a visit is on the
-- way or in progress.
-- ---------------------------------------------------------------------------
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

  if not coalesce(profile_available, false) then
    return jsonb_build_object(
      'professionalId', p_professional_id,
      'dateIso', p_date::text,
      'available', false,
      'slots', slots
    );
  end if;

  for slot_record in
    select
      trim(to_char((time '00:00' + candidate.slot_index * interval '30 minutes')::time, 'FMHH12:MI AM')) as label,
      (time '00:00' + candidate.slot_index * interval '30 minutes')::time as local_time
    from generate_series(0, 47) as candidate(slot_index)
  loop
    slot_start := (p_date + slot_record.local_time) at time zone 'Africa/Addis_Ababa';
    slot_end := slot_start + make_interval(mins => requested_duration);

    if slot_start <= now() then
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
revoke all on function private.professional_availability_api_without_active_booking(uuid, date, text, text) from public, anon, authenticated;

commit;

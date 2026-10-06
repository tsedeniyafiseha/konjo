begin;

-- "On a visit" (private.professional_on_visit, 202609300003) means on the way
-- to or in the middle of a visit. Accepted future bookings do not block the
-- professional: clients book weeks ahead, and the slot collision check below
-- already keeps two visits from overlapping.

-- Keep the collision-aware slot implementation, but hide every slot while the
-- professional is on the way to or in the middle of another visit. Passing an
-- excluded booking still permits that booking's rescheduling flow.
alter function private.professional_availability_api(uuid, date, text, text)
  rename to professional_availability_api_without_active_booking;

create function private.professional_availability_api(
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
begin
  if exists (
    select 1 from public.bookings booking
    where booking.professional_id = p_professional_id
      and booking.status in ('on_the_way', 'in_progress')
      and (p_exclude_booking_id is null or booking.id::text <> p_exclude_booking_id)
  ) then
    return jsonb_build_object(
      'professionalId', p_professional_id,
      'dateIso', p_date::text,
      'available', false,
      'slots', '[]'::jsonb
    );
  end if;

  return private.professional_availability_api_without_active_booking(
    p_professional_id,
    p_date,
    p_service_id,
    p_exclude_booking_id
  );
end;
$$;

revoke all on function private.professional_availability_api_without_active_booking(uuid, date, text, text)
  from public, anon, authenticated;
grant execute on function private.professional_availability_api_without_active_booking(uuid, date, text, text)
  to service_role;
revoke all on function private.professional_availability_api(uuid, date, text, text)
  from public, anon, authenticated;
grant execute on function private.professional_availability_api(uuid, date, text, text)
  to service_role;

-- Preserve the full payment/state-machine implementation and put the
-- scheduled-start guard in front of it: the journey can start up to three
-- hours before the appointment, not days early. The API supplies
-- p_occurred_at from its trusted clock, so clients cannot unlock this
-- transition themselves.
alter function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric)
  rename to transition_professional_booking_without_start_guard;

create function public.transition_professional_booking(
  p_professional_id uuid,
  p_booking_id uuid,
  p_action text,
  p_occurred_at timestamptz,
  p_travel_fee numeric default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  current_status public.booking_status;
  scheduled_start timestamptz;
begin
  if p_action = 'travel' then
    select booking.status, booking.scheduled_start
    into current_status, scheduled_start
    from public.bookings booking
    where booking.id = p_booking_id
      and booking.professional_id = p_professional_id
    for update;

    if found
      and current_status = 'accepted'
      and p_occurred_at < scheduled_start - interval '3 hours'
    then
      return 'too_early';
    end if;
  end if;

  return public.transition_professional_booking_without_start_guard(
    p_professional_id,
    p_booking_id,
    p_action,
    p_occurred_at,
    p_travel_fee
  );
end;
$$;

revoke all on function public.transition_professional_booking_without_start_guard(uuid, uuid, text, timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.transition_professional_booking_without_start_guard(uuid, uuid, text, timestamptz, numeric)
  to service_role;
revoke all on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric)
  from public, anon, authenticated;
grant execute on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric)
  to service_role;

commit;

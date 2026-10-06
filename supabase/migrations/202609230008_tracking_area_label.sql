begin;

-- Live tracking: the professional's phone reverse-geocodes its position
-- (throttled) and sends a short area name such as "Bole, Addis Ababa" with the
-- point. Clients read it back as "Currently near Bole" next to the map.
--
-- Replaces public.record_booking_location(…8 args…) with a 9-argument version
-- that stores the label, and extends private.booking_tracking_api so every
-- booking projection carries it. No other definitions of either function remain.

alter table public.booking_tracking
  add column if not exists area_label text
  check (area_label is null or char_length(area_label) between 1 and 80);

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
    'areaLabel', tracking.area_label,
    'recordedAt', tracking.recorded_at
  )
  from public.booking_tracking tracking
  where tracking.booking_id = p_booking_id;
$$;
revoke all on function private.booking_tracking_api(uuid) from public, anon, authenticated;
grant execute on function private.booking_tracking_api(uuid) to service_role;

drop function if exists public.record_booking_location(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz
);

-- Only the assigned professional, only while en route or on site. A null
-- label keeps the previous one so a throttled geocoder never blanks the UI.
create function public.record_booking_location(
  p_professional_id uuid, p_booking_id uuid, p_latitude double precision, p_longitude double precision,
  p_accuracy_meters double precision, p_heading double precision, p_speed_mps double precision,
  p_recorded_at timestamptz, p_area_label text default null
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking_status public.booking_status;
  clean_label text := nullif(left(btrim(regexp_replace(coalesce(p_area_label, ''), '\s+', ' ', 'g')), 80), '');
begin
  select booking.status into booking_status
  from public.bookings booking
  where booking.id = p_booking_id and booking.professional_id = p_professional_id for update;
  if not found then return 'not_found'; end if;
  if booking_status not in ('on_the_way', 'in_progress') then return 'not_active'; end if;

  insert into public.booking_tracking (
    booking_id, professional_id, latitude, longitude, accuracy_meters, heading, speed_mps, area_label, recorded_at, updated_at
  ) values (
    p_booking_id, p_professional_id, p_latitude, p_longitude, p_accuracy_meters,
    case when p_heading is null or p_heading < 0 then null else p_heading end,
    case when p_speed_mps is null or p_speed_mps < 0 then null else p_speed_mps end,
    clean_label, p_recorded_at, now()
  ) on conflict (booking_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_meters = excluded.accuracy_meters,
    heading = excluded.heading,
    speed_mps = excluded.speed_mps,
    area_label = coalesce(excluded.area_label, public.booking_tracking.area_label),
    recorded_at = greatest(public.booking_tracking.recorded_at, excluded.recorded_at),
    updated_at = now()
  where excluded.recorded_at >= public.booking_tracking.recorded_at;
  return 'updated';
end;
$$;
revoke all on function public.record_booking_location(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.record_booking_location(
  uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz, text
) to service_role;

commit;

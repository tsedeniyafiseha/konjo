begin;

-- ---------------------------------------------------------------------------
-- Live-location publishing: only while the professional is on the way.
--
-- The app stops sharing at "I've arrived", but the database still accepted
-- points for in_progress bookings and after arrival. Publishing is now
-- limited to on_the_way bookings that have not recorded an arrival, so a
-- stale background task can never keep writing once the journey is over.
-- Supabase's default table grants also gave anon and authenticated TRUNCATE,
-- REFERENCES and TRIGGER on the tracking table; row security does not cover
-- those, so they are revoked. Reads stay participant-only through RLS.
-- ---------------------------------------------------------------------------

create or replace function public.record_booking_location(
  p_professional_id uuid,
  p_booking_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters double precision,
  p_heading double precision,
  p_speed_mps double precision,
  p_recorded_at timestamptz,
  p_area_label text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  booking_status public.booking_status;
  booking_arrived_at timestamptz;
  clean_label text := nullif(left(btrim(regexp_replace(coalesce(p_area_label, ''), '\s+', ' ', 'g')), 80), '');
begin
  select booking.status, booking.arrived_at into booking_status, booking_arrived_at
  from public.bookings booking
  where booking.id = p_booking_id and booking.professional_id = p_professional_id for update;
  if not found then return 'not_found'; end if;
  if booking_status <> 'on_the_way' or booking_arrived_at is not null then return 'not_active'; end if;

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

revoke truncate, references, trigger on public.booking_tracking from anon, authenticated;
revoke select on public.booking_tracking from anon;

commit;

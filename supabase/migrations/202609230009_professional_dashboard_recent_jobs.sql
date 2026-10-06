begin;

-- Professional dashboard: finished visits and the professional's rating.
--
-- Professionals could not see whether a client's final payment had landed once
-- a visit was completed (completed bookings left the dashboard), and a tapped
-- notification about a finished booking had nothing to open. The dashboard now
-- also carries `recentJobs` (completed or cancelled in the last 30 days, newest
-- first, with their payment summary) plus `rating` and `reviewCount` from the
-- professional's profile. The previous projection is kept as a private core
-- and wrapped; only the wrapper is callable.

alter function public.get_professional_dashboard(uuid, timestamptz)
  rename to get_professional_dashboard_core;
revoke all on function public.get_professional_dashboard_core(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function public.get_professional_dashboard(
  p_professional_id uuid,
  p_earnings_since timestamptz
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select core || jsonb_build_object(
    'rating', coalesce(profile.average_rating, 0),
    'reviewCount', profile.review_count,
    'recentJobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', booking.id,
        'arrivedAt', booking.arrived_at,
        'paymentSummary', private.booking_payment_summary(booking.id),
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
        'tracking', null
      ) order by coalesce(booking.completed_at, booking.cancelled_at, booking.updated_at) desc)
      from (
        select * from public.bookings finished
        where finished.professional_id = p_professional_id
          and finished.status in ('completed', 'cancelled')
          and coalesce(finished.completed_at, finished.cancelled_at, finished.updated_at) >= now() - interval '30 days'
        order by coalesce(finished.completed_at, finished.cancelled_at, finished.updated_at) desc
        limit 20
      ) booking
      join public.profiles client on client.user_id = booking.client_id
    ), '[]'::jsonb)
  )
  from public.get_professional_dashboard_core(p_professional_id, p_earnings_since) core
  join public.professional_profiles profile on profile.professional_id = p_professional_id
  where core is not null;
$$;
revoke all on function public.get_professional_dashboard(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_professional_dashboard(uuid, timestamptz) to service_role;

commit;

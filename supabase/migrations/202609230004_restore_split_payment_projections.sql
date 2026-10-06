begin;

-- ---------------------------------------------------------------------------
-- Latest booking document and professional dashboard projections.
--
-- This file is the single, current definition of `private.booking_api` and
-- `public.get_professional_dashboard`: the 202609220005 split-payment bodies
-- (`paymentSummary`, `payments`, `acceptedAt`, `travelStartedAt`, `arrivedAt`)
-- plus the fields added on 2026-09-23: `serviceFee` on the booking document and
-- `travelFeeCap` on the dashboard. Earlier 2026-09-23 migrations deliberately
-- do not touch these functions, so there is exactly one place to change them.
--
-- It also backfills `service_fee` for requests quoted before the fee existed
-- (no payment yet), so their totals match what the client saw.
-- ---------------------------------------------------------------------------

create or replace function private.booking_api(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', booking.id,
    'paymentSummary', private.booking_payment_summary(booking.id),
    'payments', coalesce((select jsonb_agg(private.payment_intent_api(p.id) order by p.created_at, p.attempt) from public.payment_intents p where p.booking_id = booking.id), '[]'::jsonb),
    'acceptedAt', booking.accepted_at, 'travelStartedAt', booking.travel_started_at, 'arrivedAt', booking.arrived_at,
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
    'serviceFee', booking.service_fee,
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
      and (private.booking_payment_summary(booking.id) ->> 'dueStage' is null or payment.stage = private.booking_payment_summary(booking.id) ->> 'dueStage')
      order by payment.created_at desc, payment.attempt desc limit 1
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
$function$;

create or replace function public.get_professional_dashboard(
  p_professional_id uuid,
  p_earnings_since timestamptz
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'jobs', coalesce((
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
    ), 0),
    'travelFeeCap', coalesce((
      select setting.value_integer from public.platform_settings setting
      where setting.key = 'travel_fee_cap_etb'
    ), 0)
  )
  from public.professional_profiles profile
  where profile.professional_id = p_professional_id
    and profile.approval_status = 'approved'
    and not profile.is_hidden;
$function$;

-- Requests quoted before the service fee existed, and not yet paid, get the
-- fee they would have been quoted today so their totals match the app.
update public.bookings booking
set service_fee = round(booking.service_price * booking.commission_rate_bps / 10000.0)
where booking.service_fee = 0
  and booking.status = 'requested'
  and not exists (select 1 from public.payment_intents payment where payment.booking_id = booking.id);

revoke all on function private.booking_api(uuid) from public, anon, authenticated;
revoke all on function public.get_professional_dashboard(uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.booking_api(uuid) to service_role;
grant execute on function public.get_professional_dashboard(uuid, timestamptz) to service_role;

commit;

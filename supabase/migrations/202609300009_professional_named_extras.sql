begin;

-- ---------------------------------------------------------------------------
-- Extra services are named by the professional, not the client.
--
-- At checkout the professional records what the client owes for services
-- beyond the booking (amount plus a short description). The extra and its
-- service fee join the booking total, so the client's final payment carries
-- them automatically and the client pays everything in one go. The client-side
-- entry point from 202609300006 is removed. Prices themselves are still only
-- changed on the professional's profile.
-- ---------------------------------------------------------------------------

alter table public.bookings add column if not exists extra_note text;

drop function if exists public.set_booking_extra_amount(uuid, uuid, numeric, timestamptz);

create or replace function public.set_booking_extras_as_professional(
  p_professional_id uuid,
  p_booking_id uuid,
  p_extra_amount numeric,
  p_extra_note text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  summary jsonb;
  new_fee numeric(12, 2);
begin
  if p_extra_amount is null or p_extra_amount < 0 or p_extra_amount > 100000 or p_extra_amount <> trunc(p_extra_amount) then
    raise exception 'extra amount must be a whole number of ETB between 0 and 100000' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_extra_note, ''))) > 200 then
    raise exception 'extra note must be at most 200 characters' using errcode = '22023';
  end if;
  select * into booking from public.bookings
  where id = p_booking_id and professional_id = p_professional_id for update;
  if not found then return 'not_found'; end if;
  summary := private.booking_payment_summary(booking.id);
  -- Only a split booking that is being or has been checked out, and whose
  -- final payment has not yet been made, can take extras.
  if booking.payment_plan <> 'split'
    or booking.status not in ('in_progress', 'completed')
    or coalesce((summary ->> 'fullyPaid')::boolean, false) then
    return 'not_allowed';
  end if;
  new_fee := round(p_extra_amount * booking.commission_rate_bps / 10000);
  update public.bookings
  set extra_amount = p_extra_amount,
      extra_fee = new_fee,
      extra_note = nullif(trim(coalesce(p_extra_note, '')), ''),
      updated_at = p_occurred_at
  where id = booking.id;
  -- A pending checkout for the old balance would collect the wrong amount.
  update public.payment_intents
  set status = 'failed', version = version + 1, updated_at = p_occurred_at
  where booking_id = booking.id and stage = 'balance' and status = 'pending';
  return 'updated';
end;
$$;
revoke all on function public.set_booking_extras_as_professional(uuid, uuid, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.set_booking_extras_as_professional(uuid, uuid, numeric, text, timestamptz) to service_role;

-- The client's booking shows what the extras were for.
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
    'extraAmount', booking.extra_amount,
    'extraFee', booking.extra_fee,
    'extraNote', booking.extra_note,
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
revoke all on function private.booking_api(uuid) from public, anon, authenticated;
grant execute on function private.booking_api(uuid) to service_role;

-- The professional's dashboard shows the extras on each job.
create or replace function private.professional_jobs_with_extras(p_jobs jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    job.value || jsonb_build_object(
      'extraAmount', coalesce(booking.extra_amount, 0),
      'extraFee', coalesce(booking.extra_fee, 0),
      'extraNote', booking.extra_note
    ) order by job.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) with ordinality job(value, ordinality)
  left join public.bookings booking on booking.id = (job.value ->> 'id')::uuid;
$$;
revoke all on function private.professional_jobs_with_extras(jsonb) from public, anon, authenticated;

alter function public.get_professional_dashboard(uuid, timestamptz)
  rename to get_professional_dashboard_without_extras;

create function public.get_professional_dashboard(
  p_professional_id uuid,
  p_earnings_since timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select base || jsonb_build_object(
    'jobs', private.professional_jobs_with_extras(base -> 'jobs'),
    'recentJobs', private.professional_jobs_with_extras(base -> 'recentJobs')
  )
  from public.get_professional_dashboard_without_extras(p_professional_id, p_earnings_since) base
  where base is not null;
$$;
revoke all on function public.get_professional_dashboard_without_extras(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_professional_dashboard_without_extras(uuid, timestamptz) to service_role;
revoke all on function public.get_professional_dashboard(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_professional_dashboard(uuid, timestamptz) to service_role;

commit;

begin;

-- ---------------------------------------------------------------------------
-- Rescheduling an accepted booking needs the professional's answer.
--
-- A client may still move a booking that is only requested. Once the
-- professional has accepted, the new time is stored as a proposal: the
-- professional is notified and approves it (the booking moves) or declines it
-- (the booking keeps its time). Either answer notifies the client, and the
-- booking then continues through the normal flow.
-- ---------------------------------------------------------------------------

alter table public.bookings add column if not exists proposed_start timestamptz;
alter table public.bookings add column if not exists proposed_at timestamptz;

create or replace function public.reschedule_client_booking(
  p_client_id uuid,
  p_booking_id uuid,
  p_date date,
  p_time text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  availability jsonb;
  new_start timestamptz;
  needs_approval boolean;
begin
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if booking.status not in ('requested', 'accepted') then
    return jsonb_build_object('result', 'not_allowed');
  end if;

  availability := private.professional_availability_api(
    booking.professional_id, p_date, booking.service_id::text, booking.id::text
  );
  if not coalesce(availability -> 'slots', '[]'::jsonb) ? p_time then
    return jsonb_build_object('result', 'slot_unavailable');
  end if;

  new_start := private.booking_scheduled_start(p_date, p_time);
  needs_approval := booking.status = 'accepted';
  if needs_approval then
    update public.bookings set
      proposed_start = new_start,
      proposed_at = p_occurred_at,
      version = version + 1,
      updated_at = p_occurred_at
    where id = booking.id and version = booking.version;
  else
    update public.bookings set
      scheduled_start = new_start,
      proposed_start = null,
      proposed_at = null,
      version = version + 1,
      updated_at = p_occurred_at
    where id = booking.id and version = booking.version;
  end if;
  if not found then return jsonb_build_object('result', 'not_allowed'); end if;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'BookingRescheduled', 1, 'booking', booking.id::text, booking.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    jsonb_build_object(
      'clientId', p_client_id,
      'professionalId', booking.professional_id,
      'dateIso', p_date::text,
      'time', p_time,
      'requiresApproval', needs_approval
    )
  );

  return jsonb_build_object(
    'result', 'updated',
    'booking', private.booking_api(booking.id)
  );
end;
$$;
revoke all on function public.reschedule_client_booking(uuid, uuid, date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reschedule_client_booking(uuid, uuid, date, text, timestamptz) to service_role;

-- The professional answers from their job: approve moves the booking, decline keeps the current time.
alter function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric)
  rename to transition_professional_booking_without_reschedule_review;

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
  booking public.bookings%rowtype;
begin
  if p_action not in ('approve-reschedule', 'decline-reschedule') then
    return public.transition_professional_booking_without_reschedule_review(p_professional_id, p_booking_id, p_action, p_occurred_at, p_travel_fee);
  end if;
  select * into booking from public.bookings
  where id = p_booking_id and professional_id = p_professional_id for update;
  if not found then return 'not_found'; end if;
  if booking.status <> 'accepted' or booking.proposed_start is null then return 'invalid_transition'; end if;
  if p_action = 'approve-reschedule' then
    update public.bookings set
      scheduled_start = booking.proposed_start,
      proposed_start = null, proposed_at = null,
      version = version + 1, updated_at = p_occurred_at
    where id = booking.id;
  else
    update public.bookings set
      proposed_start = null, proposed_at = null,
      version = version + 1, updated_at = p_occurred_at
    where id = booking.id;
  end if;
  insert into public.booking_status_events (booking_id, status, changed_by, note, created_at)
  values (booking.id, booking.status, p_professional_id,
    case when p_action = 'approve-reschedule' then 'reschedule approved' else 'reschedule declined' end, p_occurred_at);
  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    case when p_action = 'approve-reschedule' then 'BookingRescheduleAccepted' else 'BookingRescheduleDeclined' end,
    1, 'booking', booking.id::text, booking.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    jsonb_build_object(
      'clientId', booking.client_id,
      'professionalId', p_professional_id,
      'dateIso', (booking.proposed_start at time zone 'Africa/Addis_Ababa')::date::text,
      'time', trim(to_char(booking.proposed_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM'))
    )
  );
  return 'updated';
end;
$$;
revoke all on function public.transition_professional_booking_without_reschedule_review(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.transition_professional_booking_without_reschedule_review(uuid, uuid, text, timestamptz, numeric) to service_role;
revoke all on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) to service_role;

-- Booking documents carry the pending proposal.
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
    'proposedDateIso', (booking.proposed_start at time zone 'Africa/Addis_Ababa')::date::text,
    'proposedTime', case when booking.proposed_start is null then null else trim(to_char(booking.proposed_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM')) end,
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
    'discountAmount', booking.discount_amount,
    'discountRateBps', booking.discount_rate_bps,
    'discountReason', booking.discount_reason,
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

-- The professional's dashboard shows the proposal on each job.
create or replace function private.professional_jobs_with_reschedule(p_jobs jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    job.value || jsonb_build_object(
      'proposedDateIso', (booking.proposed_start at time zone 'Africa/Addis_Ababa')::date::text,
      'proposedTime', case when booking.proposed_start is null then null else trim(to_char(booking.proposed_start at time zone 'Africa/Addis_Ababa', 'FMHH12:MI AM')) end
    ) order by job.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_jobs, '[]'::jsonb)) with ordinality job(value, ordinality)
  left join public.bookings booking on booking.id = (job.value ->> 'id')::uuid;
$$;
revoke all on function private.professional_jobs_with_reschedule(jsonb) from public, anon, authenticated;

alter function public.get_professional_dashboard(uuid, timestamptz)
  rename to get_professional_dashboard_without_reschedule;

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
    'jobs', private.professional_jobs_with_reschedule(base -> 'jobs'),
    'recentJobs', private.professional_jobs_with_reschedule(base -> 'recentJobs')
  )
  from public.get_professional_dashboard_without_reschedule(p_professional_id, p_earnings_since) base
  where base is not null;
$$;
revoke all on function public.get_professional_dashboard_without_reschedule(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_professional_dashboard_without_reschedule(uuid, timestamptz) to service_role;
revoke all on function public.get_professional_dashboard(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.get_professional_dashboard(uuid, timestamptz) to service_role;

commit;

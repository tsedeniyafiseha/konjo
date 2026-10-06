begin;

-- ---------------------------------------------------------------------------
-- Extras at the final payment.
--
-- A visit sometimes includes services beyond the one booked. The remaining
-- half of the booking is the minimum the client pays at the end; they may add
-- the amount the professional charged for extras. The extra carries the same
-- service fee as the base price, so the professional receives the extra in
-- full and Konjo's commission covers both. The booking total includes the
-- extra, so the outstanding balance, receipts, earnings and payouts follow
-- without further changes. Prices themselves are never changed on a booking:
-- professionals change them on their profile.
-- ---------------------------------------------------------------------------

alter table public.bookings add column if not exists extra_amount numeric(12, 2) not null default 0 check (extra_amount >= 0);
alter table public.bookings add column if not exists extra_fee numeric(12, 2) not null default 0 check (extra_fee >= 0);
alter table public.bookings drop column total;
alter table public.bookings
  add column total numeric(12, 2) generated always as (service_price + service_fee + travel_fee + extra_amount + extra_fee) stored;

-- The client sets extras only for the final payment of a completed split booking
-- that is not yet fully paid. Changing the amount voids any pending checkout
-- for the old balance so the next attempt is created for the new one.
create or replace function public.set_booking_extra_amount(
  p_client_id uuid,
  p_booking_id uuid,
  p_extra_amount numeric,
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
  select * into booking from public.bookings
  where id = p_booking_id and client_id = p_client_id for update;
  if not found then return 'not_found'; end if;
  summary := private.booking_payment_summary(booking.id);
  if booking.status <> 'completed' or booking.payment_plan <> 'split' or coalesce(summary ->> 'dueStage', '') <> 'balance' then
    return 'not_allowed';
  end if;
  if booking.extra_amount = p_extra_amount then return 'updated'; end if;
  new_fee := round(p_extra_amount * booking.commission_rate_bps / 10000);
  update public.bookings
  set extra_amount = p_extra_amount, extra_fee = new_fee, updated_at = p_occurred_at
  where id = booking.id;
  update public.payment_intents
  set status = 'failed', version = version + 1, updated_at = p_occurred_at
  where booking_id = booking.id and stage = 'balance' and status = 'pending';
  return 'updated';
end;
$$;

create or replace function private.settle_split_booking(p_booking_id uuid, p_occurred_at timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings%rowtype;
  p public.payment_intents%rowtype;
  commission numeric(12,2);
  part numeric(12,2);
  allocated numeric(12,2) := 0;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if b.payment_plan <> 'split' or b.status <> 'completed' then return; end if;
  if not (private.booking_payment_summary(b.id) ->> 'fullyPaid')::boolean then return; end if;
  -- Konjo's take is the service fee on the base price plus the fee on any extras
  -- the client added at the final payment; the professional receives the rest.
  commission := round(b.service_price * b.commission_rate_bps / 10000) + round(b.extra_amount * b.commission_rate_bps / 10000);
  for p in select * from public.payment_intents where booking_id = b.id and status = 'captured' order by stage desc loop
    part := case when p.stage = 'balance' then commission - allocated else round(commission * p.amount / b.total, 2) end;
    allocated := allocated + part;
    insert into public.ledger_entries(booking_id, payment_intent_id, entry_group, account, amount, created_at) values
      (b.id, p.id, 'release:' || p.id, 'escrow_liability', p.amount, p_occurred_at),
      (b.id, p.id, 'release:' || p.id, 'professional_payable', -(p.amount - part), p_occurred_at),
      (b.id, p.id, 'release:' || p.id, 'platform_commission', -part, p_occurred_at)
      on conflict (entry_group, account) do nothing;
  end loop;
  insert into public.professional_earnings(professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at)
    values(b.professional_id, b.id, b.total, commission, b.total - commission, p_occurred_at)
    on conflict (booking_id) do nothing;
end;
$$;

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

revoke all on function public.set_booking_extra_amount(uuid, uuid, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.set_booking_extra_amount(uuid, uuid, numeric, timestamptz) to service_role;
revoke all on function private.settle_split_booking(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_api(uuid) from public, anon, authenticated;
grant execute on function private.booking_api(uuid) to service_role;

commit;

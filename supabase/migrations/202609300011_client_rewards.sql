begin;

-- ---------------------------------------------------------------------------
-- Client rewards.
--
-- A client's first booking is discounted, and after every tenth completed
-- booking they earn a coupon for the same discount on their next booking. The
-- discount comes off the service price and is funded by Konjo: the
-- professional still receives the full service price (plus travel fee and
-- extras), so Konjo's commission on a discounted booking is its usual fee
-- minus the discount. Both figures are platform settings an administrator can
-- change; the defaults are 20% and every 10 bookings.
-- ---------------------------------------------------------------------------

insert into public.platform_settings (key, value_integer) values ('reward_discount_rate_bps', 2000)
  on conflict (key) do nothing;
insert into public.platform_settings (key, value_integer) values ('reward_every_bookings', 10)
  on conflict (key) do nothing;

alter table public.bookings add column if not exists discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0);
alter table public.bookings add column if not exists discount_rate_bps integer not null default 0 check (discount_rate_bps between 0 and 10000);
alter table public.bookings add column if not exists discount_reason text check (discount_reason in ('first_booking', 'loyalty'));
alter table public.bookings drop column total;
alter table public.bookings
  add column total numeric(12, 2) generated always as (service_price + service_fee + travel_fee + extra_amount + extra_fee - discount_amount) stored;

-- One coupon per loyalty milestone (10th, 20th, … completed booking). A coupon
-- is spent by the booking that redeems it; if that booking is cancelled the
-- coupon is free again, so a cancelled booking never costs the client a reward.
create table if not exists public.client_reward_coupons (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.profiles (user_id) on delete cascade,
  milestone integer not null check (milestone > 0),
  rate_bps integer not null check (rate_bps between 1 and 10000),
  earned_at timestamptz not null default now(),
  redeemed_booking_id uuid references public.bookings (id) on delete set null,
  redeemed_at timestamptz,
  unique (client_id, milestone)
);
alter table public.client_reward_coupons enable row level security;
revoke all on table public.client_reward_coupons from public, anon, authenticated;

create or replace function private.client_reward_setting(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value_integer from public.platform_settings where key = p_key), p_default);
$$;
revoke all on function private.client_reward_setting(text, integer) from public, anon, authenticated;

-- A coupon the client can spend: never redeemed, or redeemed by a booking that was cancelled.
create or replace function private.available_reward_coupon(p_client_id uuid)
returns public.client_reward_coupons
language sql
stable
security definer
set search_path = ''
as $$
  select coupon.*
  from public.client_reward_coupons coupon
  left join public.bookings redeemed on redeemed.id = coupon.redeemed_booking_id
  where coupon.client_id = p_client_id
    and (coupon.redeemed_booking_id is null or redeemed.status = 'cancelled')
  order by coupon.milestone
  limit 1;
$$;
revoke all on function private.available_reward_coupon(uuid) from public, anon, authenticated;

-- The reward that applies to the client's next booking, or null.
create or replace function private.client_reward_offer(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  coupon public.client_reward_coupons;
begin
  if not exists (
    select 1 from public.bookings where client_id = p_client_id and status <> 'cancelled'
  ) then
    return jsonb_build_object(
      'reason', 'first_booking',
      'rateBps', private.client_reward_setting('reward_discount_rate_bps', 2000)
    );
  end if;
  coupon := private.available_reward_coupon(p_client_id);
  if coupon.id is null then return null; end if;
  return jsonb_build_object('reason', 'loyalty', 'rateBps', coupon.rate_bps, 'couponId', coupon.id);
end;
$$;
revoke all on function private.client_reward_offer(uuid) from public, anon, authenticated;

create or replace function public.get_client_rewards(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  completed integer;
  every_bookings integer := greatest(1, private.client_reward_setting('reward_every_bookings', 10));
  available integer;
begin
  select count(*) into completed from public.bookings where client_id = p_client_id and status = 'completed';
  select count(*) into available
  from public.client_reward_coupons coupon
  left join public.bookings redeemed on redeemed.id = coupon.redeemed_booking_id
  where coupon.client_id = p_client_id
    and (coupon.redeemed_booking_id is null or redeemed.status = 'cancelled');
  return jsonb_build_object(
    'discountRateBps', private.client_reward_setting('reward_discount_rate_bps', 2000),
    'everyBookings', every_bookings,
    'completedBookings', completed,
    'bookingsUntilNextCoupon', every_bookings - (completed % every_bookings),
    'availableCoupons', available,
    'offer', private.client_reward_offer(p_client_id)
  );
end;
$$;
revoke all on function public.get_client_rewards(uuid) from public, anon, authenticated;
grant execute on function public.get_client_rewards(uuid) to service_role;

-- Quotes carry the reward; the commit records it and spends the coupon.
alter function public.quote_marketplace_booking(jsonb)
  rename to quote_marketplace_booking_without_rewards;

create function public.quote_marketplace_booking(p_input jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
  offer jsonb;
  discount numeric(12, 2) := 0;
  rate integer := 0;
begin
  base := public.quote_marketplace_booking_without_rewards(p_input);
  if base is null then return null; end if;
  offer := private.client_reward_offer((p_input ->> 'clientId')::uuid);
  if offer is null then
    return base || jsonb_build_object('discountAmount', 0, 'discountRateBps', 0, 'discountReason', null);
  end if;
  rate := (offer ->> 'rateBps')::integer;
  discount := round((base ->> 'servicePrice')::numeric * rate / 10000.0);
  return base || jsonb_build_object(
    'discountAmount', discount,
    'discountRateBps', rate,
    'discountReason', offer ->> 'reason',
    'total', (base ->> 'total')::numeric - discount
  );
end;
$$;
revoke all on function public.quote_marketplace_booking_without_rewards(jsonb) from public, anon, authenticated;
grant execute on function public.quote_marketplace_booking_without_rewards(jsonb) to service_role;
revoke all on function public.quote_marketplace_booking(jsonb) from public, anon, authenticated;
grant execute on function public.quote_marketplace_booking(jsonb) to service_role;

alter function public.commit_marketplace_booking(jsonb, jsonb)
  rename to commit_marketplace_booking_without_rewards;

create function public.commit_marketplace_booking(p_input jsonb, p_quote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_booking_id uuid;
  v_client_id uuid := (p_input ->> 'clientId')::uuid;
  discount numeric(12, 2) := coalesce((p_quote ->> 'discountAmount')::numeric, 0);
  reason text := p_quote ->> 'discountReason';
  coupon public.client_reward_coupons;
begin
  result := public.commit_marketplace_booking_without_rewards(p_input, p_quote);
  if result is null or coalesce((result ->> 'duplicate')::boolean, false) then return result; end if;
  v_booking_id := (result #>> '{booking,id}')::uuid;
  if discount > 0 and reason in ('first_booking', 'loyalty') then
    update public.bookings
    set discount_amount = discount,
        discount_rate_bps = coalesce((p_quote ->> 'discountRateBps')::integer, 0),
        discount_reason = reason
    where id = v_booking_id and discount_amount = 0 and discount_reason is null;
    if reason = 'loyalty' then
      coupon := private.available_reward_coupon(v_client_id);
      if coupon.id is not null then
        update public.client_reward_coupons
        set redeemed_booking_id = v_booking_id, redeemed_at = now()
        where id = coupon.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('booking', private.booking_api(v_booking_id), 'paymentIntent', null, 'duplicate', false);
end;
$$;
revoke all on function public.commit_marketplace_booking_without_rewards(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_marketplace_booking_without_rewards(jsonb, jsonb) to service_role;
revoke all on function public.commit_marketplace_booking(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_marketplace_booking(jsonb, jsonb) to service_role;

-- Completing a booking can earn the client a coupon.
create or replace function private.award_reward_coupon(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  completed integer;
  every_bookings integer := greatest(1, private.client_reward_setting('reward_every_bookings', 10));
begin
  select client_id into v_client_id from public.bookings where id = p_booking_id and status = 'completed';
  if v_client_id is null then return; end if;
  select count(*) into completed from public.bookings where client_id = v_client_id and status = 'completed';
  if completed > 0 and completed % every_bookings = 0 then
    insert into public.client_reward_coupons (client_id, milestone, rate_bps)
    values (v_client_id, completed, private.client_reward_setting('reward_discount_rate_bps', 2000))
    on conflict (client_id, milestone) do nothing;
  end if;
end;
$$;
revoke all on function private.award_reward_coupon(uuid) from public, anon, authenticated;

alter function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric)
  rename to transition_professional_booking_without_rewards;

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
  result text;
begin
  result := public.transition_professional_booking_without_rewards(p_professional_id, p_booking_id, p_action, p_occurred_at, p_travel_fee);
  if result = 'updated' and p_action = 'complete' then
    perform private.award_reward_coupon(p_booking_id);
  end if;
  return result;
end;
$$;
revoke all on function public.transition_professional_booking_without_rewards(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.transition_professional_booking_without_rewards(uuid, uuid, text, timestamptz, numeric) to service_role;
revoke all on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.transition_professional_booking(uuid, uuid, text, timestamptz, numeric) to service_role;

-- The deposit is half of the discounted base booking; extras still land on the balance.
create or replace function private.booking_payment_summary(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with amounts as (
    select b.*,
      case when b.payment_plan = 'split'
        then ceil((b.service_price + b.service_fee + b.travel_fee - b.discount_amount) * 100 / 2) / 100
        else b.total end as deposit,
      coalesce((select sum(p.amount - p.refunded_amount) from public.payment_intents p
        where p.booking_id = b.id and p.status in ('captured', 'cash_collected')), 0) as paid
    from public.bookings b where b.id = p_booking_id
  ) select jsonb_build_object(
    'plan', payment_plan, 'depositAmount', deposit, 'balanceAmount', total - deposit,
    'paidAmount', paid, 'outstandingAmount', greatest(0, total - paid),
    'depositPaid', paid >= deposit, 'fullyPaid', paid >= total,
    'dueStage', case when status = 'accepted' and paid < deposit then
      case when payment_plan = 'split' then 'deposit' else 'full' end
      when status = 'completed' and paid >= deposit and paid < total then 'balance' else null end
  ) from amounts;
$$;
revoke all on function private.booking_payment_summary(uuid) from public, anon, authenticated;
grant execute on function private.booking_payment_summary(uuid) to service_role;

-- Konjo funds the discount: its commission is the fee on the price and extras minus the discount.
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
  commission := round(b.service_price * b.commission_rate_bps / 10000) + round(b.extra_amount * b.commission_rate_bps / 10000) - b.discount_amount;
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
revoke all on function private.settle_split_booking(uuid, timestamptz) from public, anon, authenticated;

-- The booking document shows the reward.
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

commit;

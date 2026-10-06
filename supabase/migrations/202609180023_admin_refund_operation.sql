begin;

create or replace function public.refund_admin_booking(
  p_audit_id uuid,
  p_admin_id uuid,
  p_booking_id uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
  payment public.payment_intents%rowtype;
  earning public.professional_earnings%rowtype;
  has_partial_cancellation boolean;
  commission_amount numeric(12, 2);
  professional_amount numeric(12, 2);
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  select * into booking from public.bookings where id = p_booking_id for update;
  select * into payment from public.payment_intents where booking_id = p_booking_id for update;
  if booking.id is null or payment.id is null then return jsonb_build_object('result', 'not_found'); end if;
  has_partial_cancellation := booking.cancellation_policy in ('travel_fee_forfeit', 'client_no_show');
  if payment.status = 'refunded' and (not has_partial_cancellation or payment.refunded_amount >= payment.amount) then
    insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
    values (p_audit_id, p_admin_id, 'payment.refunded', 'booking', p_booking_id::text,
      jsonb_build_object('paymentIntentId', payment.id, 'duplicate', true), p_occurred_at);
    return jsonb_build_object('result', 'already_refunded', 'paymentIntent', private.payment_intent_api(payment.id));
  end if;
  if payment.status = 'failed' then return jsonb_build_object('result', 'not_refundable'); end if;
  select * into earning from public.professional_earnings where booking_id = p_booking_id for update;
  if earning.payout_id is not null then return jsonb_build_object('result', 'payout_locked'); end if;

  commission_amount := round(booking.service_price * booking.commission_rate_bps / 10000);
  if payment.status = 'refunded' and has_partial_cancellation then
    commission_amount := case when booking.cancellation_policy = 'client_no_show' then commission_amount else 0 end;
    professional_amount := booking.travel_fee;
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'admin-retained-refund:' || payment.id, 'provider_clearing', -(payment.amount - payment.refunded_amount), p_occurred_at),
      (booking.id, payment.id, 'admin-retained-refund:' || payment.id, 'professional_payable', professional_amount, p_occurred_at),
      (booking.id, payment.id, 'admin-retained-refund:' || payment.id, 'platform_commission', commission_amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
    delete from public.professional_earnings where booking_id = booking.id;
  end if;

  if exists (
    select 1 from public.ledger_entries
    where payment_intent_id = payment.id and entry_group = 'release:' || payment.id::text
  ) then
    commission_amount := round(booking.service_price * booking.commission_rate_bps / 10000);
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'release-reversal:' || payment.id, 'escrow_liability', -payment.amount, p_occurred_at),
      (booking.id, payment.id, 'release-reversal:' || payment.id, 'professional_payable', payment.amount - commission_amount, p_occurred_at),
      (booking.id, payment.id, 'release-reversal:' || payment.id, 'platform_commission', commission_amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
    delete from public.professional_earnings where booking_id = booking.id;
  end if;

  if payment.status in ('captured', 'cash_collected') then
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (booking.id, payment.id, 'refund:' || payment.id, 'provider_clearing', -payment.amount, p_occurred_at),
      (booking.id, payment.id, 'refund:' || payment.id, 'escrow_liability', payment.amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
  end if;

  update public.payment_intents set status = 'refunded', refunded_amount = payment.amount,
    version = version + 1, updated_at = p_occurred_at
  where id = payment.id and version = payment.version;
  if not found then raise exception 'payment changed during administrator refund'; end if;
  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'PaymentRefunded', 1, 'payment', payment.id::text, payment.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    'admin-refund:' || booking.id::text,
    jsonb_build_object(
      'clientId', booking.client_id, 'bookingId', booking.id,
      'paymentIntentId', payment.id, 'provider', payment.provider::text,
      'reason', 'admin_refund', 'refundedAmount', payment.amount
    )
  );
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'payment.refunded', 'booking', p_booking_id::text,
    jsonb_build_object('paymentIntentId', payment.id, 'duplicate', false), p_occurred_at);
  return jsonb_build_object('result', 'refunded', 'paymentIntent', private.payment_intent_api(payment.id));
end;
$$;

revoke all on function public.refund_admin_booking(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.refund_admin_booking(uuid, uuid, uuid, timestamptz)
  to service_role;

commit;

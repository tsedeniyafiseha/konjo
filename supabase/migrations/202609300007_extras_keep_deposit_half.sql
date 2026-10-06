begin;

-- Extras added at the final payment must not move the deposit. The deposit is
-- half of the base booking (service price, service fee and travel fee); the
-- extras and their fee land entirely on the outstanding balance. Without this,
-- adding an extra raised the "deposit" above what was already paid and the
-- booking lost its payable stage.
create or replace function private.booking_payment_summary(p_booking_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with amounts as (
    select b.*,
      case when b.payment_plan = 'split'
        then ceil((b.service_price + b.service_fee + b.travel_fee) * 100 / 2) / 100
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

commit;

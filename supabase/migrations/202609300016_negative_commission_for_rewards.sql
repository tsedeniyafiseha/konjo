begin;

-- Konjo funds client rewards out of its commission. A 20% welcome gift on an
-- 18% fee leaves Konjo paying the difference, so the recorded commission on
-- such a booking is negative and the professional's net exceeds the gross the
-- client paid. The earnings table must accept that; the net is still never
-- negative and still equals gross minus commission.
alter table public.professional_earnings drop constraint if exists professional_earnings_commission_amount_check;

commit;

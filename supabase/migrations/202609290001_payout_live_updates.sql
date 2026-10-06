begin;

-- ---------------------------------------------------------------------------
-- Payout changes reach open screens immediately.
--
-- The admin dashboard and the professional's payout screen subscribe to row
-- changes over Supabase Realtime. Until now only bookings, tracking, payments
-- and the notification inbox were published, so a payout prepared or marked
-- paid on the admin dashboard only appeared on the professional's phone after
-- a manual reload, and earnings landing after a checkout only reached the
-- dashboard on its next poll. Both tables already carry owner-or-admin read
-- policies (202609230010), which Realtime enforces per subscriber.
-- ---------------------------------------------------------------------------

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payout_batches'
  ) then
    alter publication supabase_realtime add table public.payout_batches;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'professional_earnings'
  ) then
    alter publication supabase_realtime add table public.professional_earnings;
  end if;
end $$;

commit;

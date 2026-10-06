begin;

-- Production hardening from the Supabase advisors (2026-09-26).
--
-- The marketplace listing is served to the app by the Konjo API with the
-- service role; nothing calls the RPC directly, so it must not be reachable
-- from the public API with the anonymous or a signed-in key.
revoke execute on function public.list_marketplace_professionals(jsonb, date) from public, anon, authenticated;
grant execute on function public.list_marketplace_professionals(jsonb, date) to service_role;

-- Payout batches record which administrator paid them; the lookup was unindexed.
create index if not exists payout_batches_paid_by_idx on public.payout_batches (paid_by);

commit;

-- Execute after the migration inside a transaction, then ROLLBACK.
do $$
begin
  if has_function_privilege('anon', 'public.list_marketplace_professionals(jsonb,date)', 'execute') then raise exception 'marketplace listing callable anonymously'; end if;
  if has_function_privilege('authenticated', 'public.list_marketplace_professionals(jsonb,date)', 'execute') then raise exception 'marketplace listing callable by signed-in users'; end if;
  if not has_function_privilege('service_role', 'public.list_marketplace_professionals(jsonb,date)', 'execute') then raise exception 'API lost the marketplace listing'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payout_batches_paid_by_idx') then raise exception 'paid_by index missing'; end if;
end $$;

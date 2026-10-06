-- Execute after the migration inside a transaction, then ROLLBACK.
-- The professional dashboard lists finished visits with their payment state and the rating.
do $$
declare
  pro uuid; client uuid; booking uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  dashboard jsonb; recent jsonb;
begin
  select professional_id into pro from public.professional_profiles where approval_status = 'approved' and not is_hidden limit 1;
  select p.user_id into client from public.profiles p where p.account_role = 'client' and private.client_has_identity_upload(p.user_id) limit 1;
  if pro is null or client is null then raise exception 'approved professional and client fixtures required'; end if;

  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, service_fee, travel_fee, status, completed_at)
  select booking, booking::text, client, pro, s.id, 'Dashboard contract', now_at - interval '2 days', 60, 'Test', 'Test', 'Synthetic test address', 'telebirr', 1000, 180, 0, 'completed', now_at - interval '2 days'
  from public.professional_services s where s.professional_id = pro limit 1;

  dashboard := public.get_professional_dashboard(pro, now_at - interval '7 days');
  if dashboard is null then raise exception 'dashboard missing'; end if;
  if (dashboard ->> 'rating')::numeric <> coalesce((select average_rating from public.professional_profiles where professional_id = pro), 0) then raise exception 'rating missing %', dashboard -> 'rating'; end if;
  if (dashboard ->> 'reviewCount')::integer <> (select review_count from public.professional_profiles where professional_id = pro) then raise exception 'review count missing'; end if;
  select value into recent from jsonb_array_elements(dashboard -> 'recentJobs') value where value ->> 'id' = booking::text;
  if recent is null then raise exception 'completed booking not in recentJobs %', dashboard -> 'recentJobs'; end if;
  if recent ->> 'status' <> 'completed' or (recent -> 'paymentSummary' ->> 'fullyPaid') is null then raise exception 'recent job lacks payment summary %', recent; end if;
  if exists (select 1 from jsonb_array_elements(dashboard -> 'jobs') value where value ->> 'id' = booking::text) then raise exception 'completed booking still in active jobs'; end if;
  if (select count(*) from pg_proc where proname = 'get_professional_dashboard') <> 1 then raise exception 'dashboard overloads'; end if;
  if has_function_privilege('authenticated', 'public.get_professional_dashboard_core(uuid,timestamptz)', 'execute') then raise exception 'core projection callable by clients'; end if;
end $$;

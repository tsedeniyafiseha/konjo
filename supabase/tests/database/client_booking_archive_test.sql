-- Execute after the migration inside a transaction, then ROLLBACK.
do $$
declare
  pro uuid; client uuid; done uuid := extensions.gen_random_uuid(); open uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
begin
  select professional_id into pro from public.professional_profiles where approval_status = 'approved' limit 1;
  select p.user_id into client from public.profiles p where p.account_role = 'client' and private.client_has_identity_upload(p.user_id) limit 1;
  if pro is null or client is null then raise exception 'fixtures required'; end if;
  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name, scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, service_fee, travel_fee, status, completed_at)
  select done, done::text, client, pro, s.id, 'Archive contract', now_at - interval '3 days', 60, 'Test', 'Test', 'Synthetic', 'telebirr', 1000, 180, 0, 'completed', now_at - interval '3 days' from public.professional_services s where s.professional_id = pro limit 1;
  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name, scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, service_fee, travel_fee, status)
  select open, open::text, client, pro, s.id, 'Archive contract open', now_at + interval '3 days', 60, 'Test', 'Test', 'Synthetic', 'telebirr', 1000, 180, 0, 'requested' from public.professional_services s where s.professional_id = pro limit 1;

  if public.archive_client_booking(client, open, now_at) <> 'not_allowed' then raise exception 'open booking archived'; end if;
  if public.archive_client_booking(pro, done, now_at) <> 'not_found' then raise exception 'archived someone else''s booking'; end if;
  if public.archive_client_booking(client, done, now_at) <> 'archived' then raise exception 'archive failed'; end if;
  if public.archive_client_booking(client, done, now_at + interval '1 minute') <> 'archived' then raise exception 'archive not idempotent'; end if;
  if (select client_archived_at from public.bookings where id = done) <> now_at then raise exception 'first archive time lost'; end if;
  if exists (select 1 from jsonb_array_elements(public.list_client_bookings(client)) b where b ->> 'id' = done::text) then raise exception 'archived booking still listed'; end if;
  if not exists (select 1 from jsonb_array_elements(public.list_client_bookings(client)) b where b ->> 'id' = open::text) then raise exception 'open booking missing'; end if;
  if (select count(*) from public.bookings where id = done) <> 1 then raise exception 'booking deleted'; end if;
  if has_function_privilege('authenticated', 'public.archive_client_booking(uuid,uuid,timestamptz)', 'execute') then raise exception 'archive callable by clients directly'; end if;
end $$;

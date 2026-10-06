-- Execute after the migration inside a transaction, then ROLLBACK.
-- Professional payout method: registered by the professional, snapshotted on
-- every payout batch, and settled manually by an administrator with a reference.
do $$
declare
  admin uuid; pro uuid; booking uuid;
  payout uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  doc jsonb; pending jsonb; result jsonb; history jsonb;
begin
  select user_id into admin from public.profiles where account_role = 'admin' limit 1;
  select professional_id into pro from public.professional_profiles where approval_status = 'approved' limit 1;
  if admin is null or pro is null then raise exception 'admin/approved professional fixtures required'; end if;

  -- Validation and normalisation.
  if private.valid_payout_method('{"type":"bank","accountName":"K","accountNumber":"12"}'::jsonb) then raise exception 'invalid bank method accepted'; end if;
  if private.valid_payout_method('{"type":"paypal","accountName":"Kiki","accountNumber":"0911000000"}'::jsonb) then raise exception 'unknown method accepted'; end if;
  if (private.payout_method_from_payload('{"type":"telebirr","accountName":" Kiki B ","accountNumber":"0931 440 250"}'::jsonb) ->> 'accountNumber') <> '+251931440250' then raise exception 'mobile not normalised'; end if;
  if (private.payout_method_from_payload('{"type":"bank","accountName":"Kiki B","accountNumber":"1000 2345 6789","bankName":"Awash Bank"}'::jsonb) ->> 'accountNumber') <> '100023456789' then raise exception 'bank account not normalised'; end if;

  -- The professional's registered method reaches the application document (professional app + admin review).
  update public.professional_profiles set payout_method = private.payout_method_from_payload('{"type":"cbe_birr","accountName":"Kiki B","accountNumber":"+251931440250"}'::jsonb) where professional_id = pro;
  doc := private.professional_application_api(pro);
  if doc #>> '{profile,payoutMethod,type}' <> 'cbe_birr' then raise exception 'application document lacks payout method %', doc -> 'profile'; end if;

  -- Earnings owed appear in the administrator's ready-to-pay list with the method.
  select id into booking from public.bookings where professional_id = pro limit 1;
  if booking is null then
    booking := extensions.gen_random_uuid();
    insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name,
      scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, service_fee, travel_fee)
    select booking, booking::text, p.user_id, pro, s.id, 'Payout contract', now_at + interval '3 days', 60, 'Test', 'Test', 'Synthetic test address', 'telebirr', 1000, 180, 100
    from public.profiles p, public.professional_services s
    where p.account_role = 'client' and private.client_has_identity_upload(p.user_id) and s.professional_id = pro limit 1;
  end if;
  insert into public.professional_earnings (professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at)
  values (pro, booking, 1280, 180, 1100, now_at) on conflict (booking_id) do nothing;
  pending := public.list_admin_pending_payouts();
  if not exists (select 1 from jsonb_array_elements(pending) p where p ->> 'professionalId' = pro::text and p #>> '{payoutMethod,type}' = 'cbe_birr') then raise exception 'pending payouts wrong %', pending; end if;

  -- Prepare (queue) snapshots the method; only administrators may do it.
  result := public.queue_admin_payout(extensions.gen_random_uuid(), admin, now_at, pro, payout);
  if result ->> 'status' <> 'queued' or result #>> '{payoutMethod,accountNumber}' <> '+251931440250' then raise exception 'queue failed %', result; end if;
  if exists (select 1 from jsonb_array_elements(public.list_admin_pending_payouts()) p where p ->> 'professionalId' = pro::text) then raise exception 'earnings not claimed'; end if;
  begin
    perform public.queue_admin_payout(extensions.gen_random_uuid(), pro, now_at, pro, extensions.gen_random_uuid());
    raise exception 'non-admin queued a payout';
  exception when insufficient_privilege then null;
  end;

  -- Mark paid records the reference, note and who paid; the professional sees the reference.
  result := public.settle_admin_payout(extensions.gen_random_uuid(), admin, now_at, pro, payout, ' TB-12345 ', 'Paid via CBE Birr app');
  if result ->> 'status' <> 'paid' or result ->> 'paidReference' <> 'TB-12345' or result ->> 'paidNote' <> 'Paid via CBE Birr app' then raise exception 'settle failed %', result; end if;
  if (select paid_by from public.payout_batches where id = payout) <> admin then raise exception 'paid_by not recorded'; end if;
  history := public.list_professional_payouts(pro);
  if not exists (select 1 from jsonb_array_elements(history) h where h ->> 'id' = payout::text and h ->> 'paidReference' = 'TB-12345') then raise exception 'professional history lacks reference %', history; end if;
  if (select count(*) from public.admin_audit_logs where target_id = payout::text and action in ('payout.queued', 'payout.paid')) <> 2 then raise exception 'audit rows missing'; end if;

  if has_function_privilege('authenticated', 'public.settle_admin_payout(uuid,uuid,timestamptz,uuid,uuid,text,text)', 'execute') then raise exception 'public payout settlement'; end if;
  if has_function_privilege('authenticated', 'public.update_my_professional_profile_without_payout_method(jsonb)', 'execute') then raise exception 'legacy profile wrapper still callable'; end if;
end $$;

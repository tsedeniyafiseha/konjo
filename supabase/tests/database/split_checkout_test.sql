-- Execute after the migration inside a transaction, then ROLLBACK.
do $$
declare
  client uuid; professional uuid; service uuid; administrator uuid;
  booking uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  context jsonb; intent jsonb; result jsonb;
begin
  select user_id into client from public.profiles where account_role = 'client' and private.client_has_identity_upload(user_id) limit 1;
  select professional_id, id into professional, service from public.professional_services limit 1;
  select user_id into administrator from public.profiles where account_role = 'admin' limit 1;
  if client is null or professional is null then raise exception 'client/professional fixtures required'; end if;
  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, travel_fee)
  values(booking, booking::text, client, professional, service, 'Checkout contract', now_at + interval '3 days',
    60, 'Test', 'Test', 'Synthetic test address', 'telebirr', 900.01, 100);
  context := public.get_booking_payment_context(client, booking);
  if context ->> 'stage' is not null then raise exception 'payment before acceptance'; end if;
  if public.get_booking_payment_context(extensions.gen_random_uuid(), booking) is not null then raise exception 'ownership leak'; end if;
  if public.transition_professional_booking(professional, booking, 'accept', now_at) <> 'updated' then raise exception 'accept failed'; end if;
  if public.transition_professional_booking(professional, booking, 'travel', now_at) <> 'payment_required' then raise exception 'unpaid travel'; end if;
  context := public.get_booking_payment_context(client, booking);
  if context ->> 'stage' <> 'deposit' or (context ->> 'amount')::numeric <> 500.01 then raise exception 'incorrect deposit %', context; end if;
  intent := jsonb_build_object('stage','deposit','attempt',1,'amount',500.01,'status','pending','providerReference',booking || ':deposit:1');
  result := public.commit_booking_payment_intent(client, booking, intent, now_at);
  if result ->> 'result' <> 'created' then raise exception 'deposit create failed %',result; end if;
  if public.commit_booking_payment_intent(client, booking, intent, now_at) ->> 'result' <> 'duplicate' then raise exception 'duplicate initiation'; end if;
  result := public.process_provider_payment_event(booking || ':failed','telebirr',booking || ':deposit:1','failed',repeat('a',64),now_at);
  context := public.get_booking_payment_context(client, booking);
  if (context ->> 'attempt')::integer <> 2 or context ->> 'paymentIntent' is not null then raise exception 'failed retry context %',context; end if;
  intent := intent || jsonb_build_object('attempt',2,'providerReference',booking || ':deposit:2');
  result := public.commit_booking_payment_intent(client, booking, intent, now_at);
  if result ->> 'result' <> 'created' then raise exception 'retry creation %',result; end if;
  result := public.process_verified_provider_payment_event(booking || ':underpaid','telebirr',booking || ':deposit:2','captured',repeat('d',64),now_at,5,'ETB');
  if result ->> 'result' <> 'invalid_transition' then raise exception 'accepted underpayment'; end if;
  result := public.process_provider_payment_event(booking || ':deposit-paid','telebirr',booking || ':deposit:2','captured',repeat('b',64),now_at);
  if result ->> 'result' <> 'updated' then raise exception 'capture failed %',result; end if;
  if public.process_provider_payment_event(booking || ':deposit-paid','telebirr',booking || ':deposit:2','captured',repeat('b',64),now_at) ->> 'result' <> 'duplicate' then raise exception 'duplicate capture'; end if;
  if public.transition_professional_booking(professional, booking, 'travel', now_at) <> 'updated' then raise exception 'travel failed'; end if;
  if public.transition_professional_booking(professional, booking, 'check-in', now_at) <> 'invalid_transition' then raise exception 'start before arrival'; end if;
  if public.transition_professional_booking(professional, booking, 'arrive', now_at) <> 'updated' then raise exception 'arrival failed'; end if;
  if public.transition_professional_booking(professional, booking, 'check-in', now_at) <> 'updated' then raise exception 'start failed'; end if;
  perform public.transition_professional_booking(professional, booking, 'check-in', now_at + interval '1 minute');
  if (select started_at from public.bookings where id = booking) <> now_at then raise exception 'timer reset'; end if;
  if public.transition_professional_booking(professional, booking, 'complete', now_at + interval '1 hour') <> 'updated' then raise exception 'checkout failed'; end if;
  if exists(select 1 from public.professional_earnings where booking_id = booking) then raise exception 'premature earnings'; end if;
  context := public.get_booking_payment_context(client, booking);
  if context ->> 'stage' <> 'balance' or (context ->> 'amount')::numeric <> 500 then raise exception 'wrong balance %',context; end if;
  intent := jsonb_build_object('stage','balance','attempt',1,'amount',500,'status','pending','providerReference',booking || ':balance');
  result := public.commit_booking_payment_intent(client, booking, intent, now_at);
  if result ->> 'result' <> 'created' then raise exception 'balance failed %',result; end if;
  result := public.process_provider_payment_event(booking || ':balance-paid','telebirr',booking || ':balance','captured',repeat('c',64),now_at);
  if result ->> 'result' <> 'updated' then raise exception 'final capture failed %',result; end if;
  result := private.booking_api(booking);
  if (result #>> '{paymentSummary,fullyPaid}')::boolean is not true then raise exception 'not fully paid %',result; end if;
  if jsonb_array_length(result -> 'payments') <> 3 then raise exception 'missing payment history'; end if;
  if (select count(*) from public.professional_earnings where booking_id = booking) <> 1 then raise exception 'missing earnings'; end if;
  if exists(select 1 from public.ledger_entries where booking_id = booking group by entry_group having sum(amount) <> 0) then raise exception 'unbalanced ledger'; end if;
  if has_function_privilege('authenticated', 'public.commit_booking_payment_intent(uuid,uuid,jsonb,timestamptz)', 'execute') then raise exception 'public payment mutation'; end if;
  if administrator is null then raise exception 'admin fixture required'; end if;
  result := public.refund_admin_booking(extensions.gen_random_uuid(),administrator,booking,now_at);
  if result ->> 'result' <> 'refunded' then raise exception 'split refund failed %',result; end if;
  if exists(select 1 from public.professional_earnings where booking_id=booking) then raise exception 'refunded earnings retained'; end if;
  if (private.booking_payment_summary(booking) ->> 'paidAmount')::numeric <> 0 then raise exception 'not all installments refunded'; end if;
  if exists(select 1 from public.ledger_entries where booking_id = booking group by entry_group having sum(amount) <> 0) then raise exception 'unbalanced refund'; end if;
  if public.refund_admin_booking(extensions.gen_random_uuid(),administrator,booking,now_at) ->> 'result' <> 'already_refunded' then raise exception 'duplicate refund failed'; end if;
end;
$$;

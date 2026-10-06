-- Run after the push-receipt migration inside a transaction, then ROLLBACK.
do $$
declare recipient uuid; notification uuid := extensions.gen_random_uuid(); at_time timestamptz := clock_timestamp(); job jsonb; found_job jsonb;
begin
  select user_id into recipient from public.profiles where account_role = 'client' limit 1;
  insert into public.notification_outbox(id,idempotency_key,user_id,channel,template,payload,status,next_attempt_at)
    values(notification,notification::text,recipient,'push','booking_accepted','{}','pending',at_time);
  job := jsonb_build_object('id',notification,'attempt',1,'destination','ExpoPushToken[receipt-contract]');
  perform public.record_notification_delivery(job,jsonb_build_object('delivered',false,'pending',true,'providerReference','expo-ticket:receipt-contract'),at_time);
  if (select push_ticket from public.notification_outbox where id=notification) <> 'receipt-contract' then raise exception 'ticket was not persisted'; end if;
  if (select status from public.notification_outbox where id=notification) <> 'pending' then raise exception 'ticket acceptance was treated as delivery'; end if;
  select value into found_job from jsonb_array_elements(public.claim_due_notification_jobs(at_time + interval '2 minutes',100)) where value ->> 'id'=notification::text;
  if found_job ->> 'pushTicket' <> 'receipt-contract' then raise exception 'receipt job lost ticket'; end if;
  perform public.record_notification_delivery(found_job,jsonb_build_object('delivered',true,'providerReference','receipt-contract'),at_time + interval '2 minutes');
  if (select status from public.notification_outbox where id=notification) <> 'delivered' then raise exception 'confirmed receipt not recorded'; end if;
end;
$$;

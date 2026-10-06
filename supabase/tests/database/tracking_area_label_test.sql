-- Execute after the migration inside a transaction, then ROLLBACK.
-- Live tracking carries a throttled, reverse-geocoded area label.
do $$
declare
  pro uuid; client uuid; booking uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  point jsonb;
begin
  select professional_id into pro from public.professional_profiles where approval_status = 'approved' limit 1;
  select p.user_id into client from public.profiles p where p.account_role = 'client' and private.client_has_identity_upload(p.user_id) limit 1;
  if pro is null or client is null then raise exception 'approved professional and client fixtures required'; end if;

  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, service_fee, travel_fee, status)
  select booking, booking::text, client, pro, s.id, 'Tracking contract', now_at + interval '1 hour', 60, 'Test', 'Test', 'Synthetic test address', 'telebirr', 1000, 180, 0, 'on_the_way'
  from public.professional_services s where s.professional_id = pro limit 1;

  -- Only the 9-argument definition exists.
  if (select count(*) from pg_proc where proname = 'record_booking_location') <> 1 then raise exception 'stale record_booking_location overloads remain'; end if;

  -- A point with a messy label is stored trimmed; a point without one keeps the previous label.
  if public.record_booking_location(pro, booking, 9.01, 38.75, 10, 90, 4, now_at, '  Bole,   Addis Ababa ') <> 'updated' then raise exception 'first point rejected'; end if;
  if public.record_booking_location(pro, booking, 9.02, 38.76, 10, 90, 4, now_at + interval '5 seconds', null) <> 'updated' then raise exception 'second point rejected'; end if;
  point := public.get_booking_tracking(client, booking);
  if point ->> 'areaLabel' <> 'Bole, Addis Ababa' or (point ->> 'latitude')::numeric <> 9.02 then raise exception 'area label not carried %', point; end if;
  if (private.booking_api(booking) #>> '{tracking,areaLabel}') <> 'Bole, Addis Ababa' then raise exception 'booking projection lacks area label'; end if;

  -- Over-long labels are cut to 80 characters rather than rejected.
  perform public.record_booking_location(pro, booking, 9.03, 38.77, 10, 90, 4, now_at + interval '10 seconds', repeat('x', 200));
  if char_length((public.get_booking_tracking(client, booking)) ->> 'areaLabel') <> 80 then raise exception 'label not capped'; end if;

  if has_function_privilege('authenticated', 'public.record_booking_location(uuid,uuid,double precision,double precision,double precision,double precision,double precision,timestamptz,text)', 'execute') then raise exception 'clients may record locations'; end if;
end $$;

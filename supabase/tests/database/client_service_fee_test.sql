-- Execute after the migration inside a transaction, then ROLLBACK.
-- The client-side service fee mirrors the commission and is part of every total.
do $$
declare
  client uuid; professional uuid; service uuid; price numeric; rate integer; expected_fee numeric;
  booking uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  quote jsonb; event_total numeric;
begin
  select user_id into client from public.profiles where account_role = 'client' and private.client_has_identity_upload(user_id) limit 1;
  select s.professional_id, s.id, s.price into professional, service, price
  from public.professional_services s
  join public.professional_profiles p on p.professional_id = s.professional_id
  where p.approval_status = 'approved' and not p.is_hidden and p.is_available and s.active
  limit 1;
  select value_integer into rate from public.platform_settings where key = 'commission_rate_bps';
  if client is null or professional is null then raise exception 'client/professional fixtures required'; end if;
  expected_fee := round(price * rate / 10000.0);

  -- A quote for any bookable slot carries the fee and a total that includes it.
  select public.quote_marketplace_booking(jsonb_build_object(
    'clientId', client, 'professionalId', professional, 'serviceId', service,
    'dateIso', d.day::text, 'time', s.slot, 'addressZone', (select name from public.zones where active limit 1),
    'femaleOnly', false)) into quote
  from (select (current_date + offs) as day from generate_series(1, 14) offs) d
  cross join lateral (
    select jsonb_array_elements_text(coalesce(private.professional_availability_api(professional, d.day, service::text, null) -> 'slots', '[]'::jsonb)) as slot
  ) s
  limit 1;
  if quote is null then raise exception 'no bookable slot in the next 14 days'; end if;
  if (quote ->> 'serviceFee')::numeric <> expected_fee then raise exception 'quote fee % should be %', quote ->> 'serviceFee', expected_fee; end if;
  if (quote ->> 'total')::numeric <> price + expected_fee then raise exception 'quote total ignores the fee %', quote; end if;
  if (quote ->> 'travelFee')::numeric <> 0 then raise exception 'quote pre-charges travel'; end if;

  -- The stored total is price + fee + travel, and acceptance adds the travel fee on top.
  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, service_fee, travel_fee)
  values(booking, booking::text, client, professional, service, 'Service fee contract', now_at + interval '3 days',
    60, 'Test', 'Test', 'Synthetic test address', 'telebirr', 3000, 540, 0);
  if (select total from public.bookings where id = booking) <> 3540 then raise exception 'total ignores the fee'; end if;
  if (private.booking_api(booking) ->> 'serviceFee')::numeric <> 540 then raise exception 'booking document lacks the fee'; end if;
  if public.transition_professional_booking(professional, booking, 'accept', now_at, 250) <> 'updated' then raise exception 'accept failed'; end if;
  if (select total from public.bookings where id = booking) <> 3790 then raise exception 'accepted total wrong'; end if;
  select (payload ->> 'total')::numeric into event_total from public.domain_event_outbox
  where event_type = 'BookingAccepted' and aggregate_id = booking::text order by occurred_at desc limit 1;
  if event_total <> 3790 then raise exception 'accept event total % should be 3790', event_total; end if;
  if (public.get_booking_payment_context(client, booking) ->> 'amount')::numeric <> 1895 then raise exception 'deposit ignores the fee'; end if;
end $$;

-- Execute after the migration inside a transaction, then ROLLBACK.
-- Professional-set travel fee, capped by the administrator-managed platform setting.
do $$
declare
  client uuid; professional uuid; service uuid; administrator uuid;
  booking uuid := extensions.gen_random_uuid();
  now_at timestamptz := clock_timestamp();
  settings jsonb; dashboard jsonb; quote jsonb;
begin
  -- Bookings require an identity upload, so pick a client that has one (same fixture rule as the checkout test).
  select user_id into client from public.profiles where account_role = 'client' and private.client_has_identity_upload(user_id) limit 1;
  select professional_id, id into professional, service from public.professional_services limit 1;
  select user_id into administrator from public.profiles where account_role = 'admin' limit 1;
  if client is null or professional is null or administrator is null then raise exception 'client/professional/admin fixtures required'; end if;

  -- The cap ships with a default and is visible to administrators and professionals alike.
  settings := public.get_admin_platform_settings();
  if (settings ->> 'travelFeeCap')::integer <> 500 then raise exception 'default cap missing %', settings; end if;
  if settings ->> 'commissionRateBps' is null then raise exception 'commission missing from settings %', settings; end if;

  -- Administrators can move the cap; the change is audited and returned in full.
  settings := public.update_admin_travel_fee_cap(extensions.gen_random_uuid(), administrator, now_at, 300);
  if (settings ->> 'travelFeeCap')::integer <> 300 then raise exception 'cap update failed %', settings; end if;
  if not exists (select 1 from public.admin_audit_logs where action = 'travel_fee_cap.updated' and target_id = 'travel_fee_cap_etb') then raise exception 'cap update not audited'; end if;
  begin
    perform public.update_admin_travel_fee_cap(extensions.gen_random_uuid(), administrator, now_at, -1);
    raise exception 'negative cap accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.update_admin_travel_fee_cap(extensions.gen_random_uuid(), client, now_at, 100);
    raise exception 'non-admin changed the cap';
  exception when insufficient_privilege then null;
  end;
  settings := public.update_admin_commission(extensions.gen_random_uuid(), administrator, now_at, 1800);
  if (settings ->> 'travelFeeCap')::integer <> 300 then raise exception 'commission update dropped the cap %', settings; end if;

  -- Requests carry no travel fee: the professional names it on acceptance.
  insert into public.bookings(id, client_request_id, client_id, professional_id, service_id, service_name,
    scheduled_start, duration_minutes, address_label, address_zone, address_detail, payment_method, service_price, travel_fee)
  values(booking, booking::text, client, professional, service, 'Travel fee contract', now_at + interval '3 days',
    60, 'Test', 'Test', 'Synthetic test address', 'telebirr', 900, 0);

  dashboard := public.get_professional_dashboard(professional, now_at - interval '7 days');
  -- The dashboard is null for a professional who is not approved and visible; the cap is asserted when it renders.
  if dashboard is not null and (dashboard ->> 'travelFeeCap')::integer <> 300 then raise exception 'dashboard cap missing %', dashboard; end if;

  if public.transition_professional_booking(professional, booking, 'accept', now_at, 301) <> 'invalid_travel_fee' then raise exception 'fee above cap accepted'; end if;
  if public.transition_professional_booking(professional, booking, 'accept', now_at, -5) <> 'invalid_travel_fee' then raise exception 'negative fee accepted'; end if;
  if public.transition_professional_booking(professional, booking, 'accept', now_at, 120.5) <> 'invalid_travel_fee' then raise exception 'fractional fee accepted'; end if;
  if (select status from public.bookings where id = booking) <> 'requested' then raise exception 'rejected fee changed status'; end if;
  begin
    perform public.transition_professional_booking(professional, booking, 'travel', now_at, 100);
    raise exception 'travel fee accepted outside accept';
  exception when sqlstate '22023' then null;
  end;

  if public.transition_professional_booking(professional, booking, 'accept', now_at, 250) <> 'updated' then raise exception 'accept with fee failed'; end if;
  if (select travel_fee from public.bookings where id = booking) <> 250 then raise exception 'travel fee not stored'; end if;
  if (select total from public.bookings where id = booking) <> 1150 then raise exception 'total not recalculated'; end if;
  if (select status from public.bookings where id = booking) <> 'accepted' then raise exception 'accept did not flip status'; end if;
  if not exists (
    select 1 from public.domain_event_outbox
    where event_type = 'BookingAccepted' and aggregate_id = booking::text
      and (payload ->> 'travelFee')::numeric = 250 and (payload ->> 'total')::numeric = 1150
  ) then raise exception 'accept event lacks fee and total'; end if;

  -- Checkout charges the accepted total, and re-accepting is idempotent.
  if (public.get_booking_payment_context(client, booking) ->> 'amount')::numeric <> 575 then raise exception 'deposit ignores travel fee'; end if;
  if public.transition_professional_booking(professional, booking, 'accept', now_at, 10) <> 'updated' then raise exception 'idempotent accept failed'; end if;
  if (select travel_fee from public.bookings where id = booking) <> 250 then raise exception 'idempotent accept changed the fee'; end if;

  -- The client can still walk away for free after seeing the fee, until the professional sets off.
  if public.cancel_client_booking(client, booking, now_at) <> 'cancelled' then raise exception 'client could not cancel free after the fee was set'; end if;
  if (select cancellation_policy from public.bookings where id = booking) <> 'full_refund' then raise exception 'cancellation after acceptance was not a full refund'; end if;

  -- Quotes never pre-charge a zone fee any more.
  quote := public.quote_marketplace_booking(jsonb_build_object(
    'professionalId', professional, 'clientId', client, 'serviceId', service,
    'addressZone', (select name from public.zones where active limit 1),
    'dateIso', ((now_at + interval '30 days') at time zone 'Africa/Addis_Ababa')::date::text, 'time', 'never', 'femaleOnly', false));
  if quote is not null and (quote ->> 'travelFee')::numeric <> 0 then raise exception 'quote pre-charges travel %', quote; end if;

  if has_function_privilege('authenticated', 'public.update_admin_travel_fee_cap(uuid,uuid,timestamptz,integer)', 'execute') then raise exception 'public cap mutation'; end if;
  if has_function_privilege('authenticated', 'public.transition_professional_booking(uuid,uuid,text,timestamptz,numeric)', 'execute') then raise exception 'public transition'; end if;
  raise notice 'travel fee cap contract passed';
end $$;

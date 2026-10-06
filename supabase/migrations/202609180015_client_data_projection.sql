begin;

create or replace function private.client_address_api(p_address_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', address.id,
    'label', address.label,
    'zone', zone.name,
    'detail', address.address_detail,
    'fee', zone.travel_fee,
    'isDefault', address.is_default,
    'createdAt', address.created_at
  )
  from public.client_addresses address
  join public.zones zone on zone.id = address.zone_id
  where address.id = p_address_id;
$$;

create or replace function private.client_account_api(p_client_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when profile.onboarding_completed_at is null then null else jsonb_build_object(
    'profile', jsonb_build_object(
      'fullName', profile.full_name,
      'email', profile.email,
      'phoneNumber', profile.phone_number,
      'preferredLanguage', profile.preferred_language
    ),
    'addresses', coalesce((
      select jsonb_agg(private.client_address_api(address.id)
        order by address.is_default desc, address.created_at)
      from public.client_addresses address
      where address.client_id = p_client_id
    ), '[]'::jsonb),
    'defaultAddressId', (
      select address.id from public.client_addresses address
      where address.client_id = p_client_id and address.is_default limit 1
    ),
    'completedAt', profile.onboarding_completed_at
  ) end
  from public.profiles profile
  where profile.user_id = p_client_id and profile.account_role = 'client';
$$;

create or replace function public.get_client_data(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when profile.user_id is null then jsonb_build_object(
    'account', null,
    'favouriteIds', '[]'::jsonb,
    'notificationPreferences', jsonb_build_object(
      'bookingUpdates', true, 'promotions', false,
      'chatMessages', true, 'smsReminders', true
    )
  ) else jsonb_build_object(
    'account', private.client_account_api(p_client_id),
    'favouriteIds', coalesce((
      select jsonb_agg(favorite.professional_id order by favorite.created_at)
      from public.favorites favorite where favorite.client_id = p_client_id
    ), '[]'::jsonb),
    'notificationPreferences', jsonb_build_object(
      'bookingUpdates', coalesce(preferences.booking_updates, true),
      'promotions', coalesce(preferences.promotions, false),
      'chatMessages', coalesce(preferences.chat_messages, true),
      'smsReminders', coalesce(preferences.sms_reminders, true)
    )
  ) end
  from (select 1) seed
  left join public.profiles profile
    on profile.user_id = p_client_id and profile.account_role = 'client'
  left join public.notification_preferences preferences
    on preferences.client_id = profile.user_id;
$$;

create or replace function public.update_client_profile(
  p_client_id uuid,
  p_full_name text,
  p_phone_number text,
  p_preferred_language text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile public.profiles%rowtype;
begin
  update public.profiles set
    full_name = trim(p_full_name),
    phone_number = p_phone_number,
    preferred_language = coalesce(p_preferred_language, preferred_language),
    updated_at = p_occurred_at
  where user_id = p_client_id and account_role = 'client'
  returning * into profile;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', profile.user_id,
    'role', profile.account_role::text,
    'email', profile.email,
    'fullName', profile.full_name,
    'phoneNumber', profile.phone_number,
    'createdAt', profile.created_at
  );
end;
$$;

create or replace function public.complete_client_onboarding(
  p_client_id uuid,
  p_full_name text,
  p_phone_number text,
  p_preferred_language text,
  p_address jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_zone_id uuid;
begin
  perform 1 from public.profiles
  where user_id = p_client_id and account_role = 'client'
  for update;
  if not found then return jsonb_build_object('result', 'client_not_found'); end if;

  if p_address is not null then
    select id into v_zone_id from public.zones
    where lower(name) = lower(trim(p_address ->> 'zone')) and active;
    if v_zone_id is null then
      return jsonb_build_object('result', 'service_zone_unavailable');
    end if;
  end if;

  update public.profiles set
    full_name = trim(p_full_name),
    phone_number = p_phone_number,
    preferred_language = p_preferred_language,
    onboarding_completed_at = p_occurred_at,
    updated_at = p_occurred_at
  where user_id = p_client_id;

  if p_address is not null and not exists (
    select 1 from public.client_addresses where client_id = p_client_id
  ) then
    insert into public.client_addresses (
      id, client_id, label, zone_id, address_detail, is_default, created_at, updated_at
    ) values (
      (p_address ->> 'id')::uuid, p_client_id, trim(p_address ->> 'label'),
      v_zone_id, trim(p_address ->> 'detail'), true, p_occurred_at, p_occurred_at
    );
  end if;

  return jsonb_build_object(
    'result', 'completed',
    'account', private.client_account_api(p_client_id)
  );
end;
$$;

create or replace function public.create_client_address(
  p_client_id uuid,
  p_address_id uuid,
  p_label text,
  p_zone text,
  p_detail text,
  p_make_default boolean,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_zone_id uuid;
  v_default boolean;
begin
  perform 1 from public.profiles
  where user_id = p_client_id and account_role = 'client'
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  select id into v_zone_id from public.zones
  where lower(name) = lower(trim(p_zone)) and active;
  if v_zone_id is null then
    return jsonb_build_object('result', 'service_zone_unavailable');
  end if;
  v_default := p_make_default or not exists (
    select 1 from public.client_addresses where client_id = p_client_id
  );
  if v_default then
    update public.client_addresses set is_default = false, updated_at = p_occurred_at
    where client_id = p_client_id and is_default;
  end if;
  insert into public.client_addresses (
    id, client_id, label, zone_id, address_detail, is_default, created_at, updated_at
  ) values (
    p_address_id, p_client_id, trim(p_label), v_zone_id, trim(p_detail),
    v_default, p_occurred_at, p_occurred_at
  );
  return jsonb_build_object('result', 'updated', 'address', private.client_address_api(p_address_id));
end;
$$;

create or replace function public.update_client_address(
  p_client_id uuid,
  p_address_id uuid,
  p_label text,
  p_zone text,
  p_detail text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_zone_id uuid;
begin
  select id into v_zone_id from public.zones
  where lower(name) = lower(trim(p_zone)) and active;
  if v_zone_id is null then
    return jsonb_build_object('result', 'service_zone_unavailable');
  end if;
  update public.client_addresses set
    label = trim(p_label), zone_id = v_zone_id,
    address_detail = trim(p_detail), updated_at = p_occurred_at
  where id = p_address_id and client_id = p_client_id;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  return jsonb_build_object('result', 'updated', 'address', private.client_address_api(p_address_id));
end;
$$;

create or replace function public.delete_client_address(
  p_client_id uuid,
  p_address_id uuid,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  was_default boolean;
  next_id uuid;
begin
  perform 1 from public.profiles where user_id = p_client_id for update;
  select is_default into was_default from public.client_addresses
  where id = p_address_id and client_id = p_client_id;
  if not found then return false; end if;
  delete from public.client_addresses where id = p_address_id;
  if was_default then
    select id into next_id from public.client_addresses
    where client_id = p_client_id order by created_at limit 1;
    if next_id is not null then
      update public.client_addresses set is_default = true, updated_at = p_occurred_at
      where id = next_id;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.set_default_client_address(
  p_client_id uuid,
  p_address_id uuid,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.profiles where user_id = p_client_id for update;
  if not exists (
    select 1 from public.client_addresses
    where id = p_address_id and client_id = p_client_id
  ) then return false; end if;
  update public.client_addresses set is_default = false, updated_at = p_occurred_at
  where client_id = p_client_id and is_default;
  update public.client_addresses set is_default = true, updated_at = p_occurred_at
  where id = p_address_id;
  return true;
end;
$$;

create or replace function public.set_client_favorite(
  p_client_id uuid,
  p_professional_id uuid,
  p_favorite boolean,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.professional_profiles
    where professional_id = p_professional_id
      and approval_status = 'approved' and not is_hidden
  ) then return 'professional_not_found'; end if;
  if p_favorite then
    insert into public.favorites (client_id, professional_id, created_at)
    values (p_client_id, p_professional_id, p_occurred_at)
    on conflict (client_id, professional_id) do nothing;
  else
    delete from public.favorites
    where client_id = p_client_id and professional_id = p_professional_id;
  end if;
  return 'updated';
end;
$$;

create or replace function public.update_client_notification_preferences(
  p_client_id uuid,
  p_preferences jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.notification_preferences (
    client_id, booking_updates, promotions, chat_messages, sms_reminders, updated_at
  ) values (
    p_client_id,
    (p_preferences ->> 'bookingUpdates')::boolean,
    (p_preferences ->> 'promotions')::boolean,
    (p_preferences ->> 'chatMessages')::boolean,
    (p_preferences ->> 'smsReminders')::boolean,
    p_occurred_at
  ) on conflict (client_id) do update set
    booking_updates = excluded.booking_updates,
    promotions = excluded.promotions,
    chat_messages = excluded.chat_messages,
    sms_reminders = excluded.sms_reminders,
    updated_at = excluded.updated_at;
  return p_preferences;
end;
$$;

create or replace function public.register_client_device(
  p_client_id uuid,
  p_registration_id uuid,
  p_platform text,
  p_token text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  registration public.device_registrations%rowtype;
begin
  insert into public.device_registrations (
    id, user_id, platform, token, active, created_at, updated_at
  ) values (
    p_registration_id, p_client_id, p_platform, p_token, true, p_occurred_at, p_occurred_at
  ) on conflict (token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    active = true,
    updated_at = excluded.updated_at
  returning * into registration;
  return jsonb_build_object(
    'id', registration.id,
    'platform', registration.platform,
    'tokenPreview', '…' || right(registration.token, 6),
    'createdAt', registration.created_at
  );
end;
$$;

create or replace function public.unregister_client_device(
  p_client_id uuid,
  p_registration_id uuid,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.device_registrations set active = false, updated_at = p_occurred_at
  where id = p_registration_id and user_id = p_client_id;
  return found;
end;
$$;

create or replace function public.list_client_notifications(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', notification.id,
    'channel', notification.channel,
    'template', notification.template,
    'status', notification.status,
    'attempts', notification.attempts,
    'createdAt', notification.created_at
  ) order by notification.created_at desc), '[]'::jsonb)
  from (
    select * from public.notification_outbox
    where user_id = p_client_id order by created_at desc limit 50
  ) notification;
$$;

create or replace function public.audit_client_payment_ledger(
  p_client_id uuid,
  p_payment_intent_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when not exists (
    select 1 from public.payment_intents
    where id = p_payment_intent_id and client_id = p_client_id
  ) then null else jsonb_build_object(
    'balanced', coalesce((
      select count(*) > 0 and bool_and(grouped.total = 0)
      from (
        select sum(entry.amount) as total
        from public.ledger_entries entry
        where entry.payment_intent_id = p_payment_intent_id
        group by entry.entry_group
      ) grouped
    ), false),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'entryGroup', grouped.entry_group,
        'total', grouped.total,
        'entries', grouped.entries
      ) order by grouped.entry_group)
      from (
        select entry.entry_group, sum(entry.amount) as total, count(*) as entries
        from public.ledger_entries entry
        where entry.payment_intent_id = p_payment_intent_id
        group by entry.entry_group
      ) grouped
    ), '[]'::jsonb)
  ) end;
$$;

create or replace function public.delete_konjo_account(
  p_user_id uuid,
  p_role public.account_role,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role = 'admin' or not exists (
    select 1 from public.profiles where user_id = p_user_id and account_role = p_role
  ) then return false; end if;

  if not exists (
    select 1 from public.bookings
    where client_id = p_user_id or professional_id = p_user_id
  ) then
    delete from auth.users where id = p_user_id;
    return found;
  end if;

  delete from public.client_addresses where client_id = p_user_id;
  delete from public.favorites where client_id = p_user_id;
  delete from public.notification_preferences where client_id = p_user_id;
  delete from public.device_registrations where user_id = p_user_id;
  delete from public.client_identity_verifications where client_id = p_user_id;
  update public.professional_profiles
  set display_name = 'Deleted professional', bio = '', is_available = false,
      is_hidden = true, updated_at = p_occurred_at
  where professional_id = p_user_id;
  update public.professional_applications
  set legal_name = 'Deleted professional', contact_email = null, fayda_last_four = null,
      updated_at = p_occurred_at
  where professional_id = p_user_id;
  delete from public.professional_identity_verifications where professional_id = p_user_id;

  update auth.users set
    email = 'deleted+' || replace(id::text, '-', '') || '@deleted.invalid',
    phone = null,
    banned_until = '9999-12-31 23:59:59+00',
    raw_user_meta_data = jsonb_build_object('role', p_role::text, 'full_name', 'Deleted account'),
    updated_at = p_occurred_at
  where id = p_user_id;
  update public.profiles set
    full_name = 'Deleted account', email = null, phone_number = null,
    onboarding_completed_at = null, updated_at = p_occurred_at
  where user_id = p_user_id;
  return true;
end;
$$;

revoke all on function private.client_address_api(uuid) from public, anon, authenticated;
revoke all on function private.client_account_api(uuid) from public, anon, authenticated;
revoke all on function public.get_client_data(uuid) from public, anon, authenticated;
revoke all on function public.update_client_profile(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_client_onboarding(uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.create_client_address(uuid, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.update_client_address(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.delete_client_address(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.set_default_client_address(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.set_client_favorite(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.update_client_notification_preferences(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.register_client_device(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.unregister_client_device(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.list_client_notifications(uuid) from public, anon, authenticated;
revoke all on function public.audit_client_payment_ledger(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_konjo_account(uuid, public.account_role, timestamptz) from public, anon, authenticated;

grant execute on function private.client_address_api(uuid) to service_role;
grant execute on function private.client_account_api(uuid) to service_role;
grant execute on function public.get_client_data(uuid) to service_role;
grant execute on function public.update_client_profile(uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.complete_client_onboarding(uuid, text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.create_client_address(uuid, uuid, text, text, text, boolean, timestamptz) to service_role;
grant execute on function public.update_client_address(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.delete_client_address(uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_default_client_address(uuid, uuid, timestamptz) to service_role;
grant execute on function public.set_client_favorite(uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function public.update_client_notification_preferences(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.register_client_device(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.unregister_client_device(uuid, uuid, timestamptz) to service_role;
grant execute on function public.list_client_notifications(uuid) to service_role;
grant execute on function public.audit_client_payment_ledger(uuid, uuid) to service_role;
grant execute on function public.delete_konjo_account(uuid, public.account_role, timestamptz) to service_role;

commit;

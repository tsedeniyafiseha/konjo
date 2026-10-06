begin;

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

  delete from public.notification_outbox where user_id = p_user_id;
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

revoke all on function public.delete_konjo_account(uuid, public.account_role, timestamptz)
  from public, anon, authenticated;
grant execute on function public.delete_konjo_account(uuid, public.account_role, timestamptz)
  to service_role;

commit;

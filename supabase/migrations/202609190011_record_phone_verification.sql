begin;

-- Supabase auto-confirms phone numbers when "Confirm phone" is disabled, so
-- auth.users.phone_confirmed_at does not prove the user received an SMS code.
-- A session created from an SMS one-time code does: record it on the profile.
alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

create or replace function private.record_phone_verification_from_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.authentication_method in ('otp', 'sms') then
    update public.profiles profile
    set phone_verified_at = coalesce(profile.phone_verified_at, now()),
        updated_at = now()
    from auth.sessions session
    where session.id = new.session_id
      and profile.user_id = session.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.record_phone_verification_from_session() from public, anon, authenticated;

drop trigger if exists record_phone_verification on auth.mfa_amr_claims;
create trigger record_phone_verification
after insert on auth.mfa_amr_claims
for each row execute function private.record_phone_verification_from_session();

-- Professionals can only sign in with an SMS code, so existing professional
-- accounts with a phone number have already proven ownership.
update public.profiles
set phone_verified_at = coalesce(phone_verified_at, now())
where account_role = 'professional' and phone_number is not null;

commit;

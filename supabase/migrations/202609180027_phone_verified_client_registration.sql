begin;

-- Client accounts are phone-authenticated. Their email is contact information,
-- captured in Auth metadata and copied into the public profile without requiring
-- an email confirmation flow.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'client');
  contact_email text := coalesce(
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'contact_email'), '')
  );
begin
  insert into public.profiles (user_id, account_role, full_name, email, phone_number)
  values (
    new.id,
    case when requested_role = 'professional' then 'professional'::public.account_role else 'client'::public.account_role end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    contact_email,
    new.phone
  )
  on conflict (user_id) do update
  set email = excluded.email,
      phone_number = excluded.phone_number,
      updated_at = now();
  return new;
end;
$$;

commit;

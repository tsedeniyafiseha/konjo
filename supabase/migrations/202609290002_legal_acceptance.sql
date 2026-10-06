begin;

-- ---------------------------------------------------------------------------
-- Explicit acceptance of the Terms & Conditions and Privacy & Security policy.
--
-- Clients accept before their account is created (recorded right after
-- sign-in), professionals accept on the final review step. Every acceptance is
-- appended with the document version the person saw, and the latest is
-- mirrored onto the profile so support and admin screens can read it cheaply.
-- ---------------------------------------------------------------------------

create table if not exists public.legal_acceptances (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_role public.account_role not null,
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now()
);
create index if not exists legal_acceptances_user_idx on public.legal_acceptances (user_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;
drop policy if exists legal_acceptances_owner_or_admin_read on public.legal_acceptances;
create policy legal_acceptances_owner_or_admin_read on public.legal_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

alter table public.profiles add column if not exists legal_accepted_version text;
alter table public.profiles add column if not exists legal_accepted_at timestamptz;

create or replace function public.accept_konjo_legal_terms(p_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role public.account_role;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'legal document version is invalid' using errcode = '22023';
  end if;

  select account_role into v_role from public.profiles where user_id = v_user;

  insert into public.legal_acceptances (user_id, account_role, version, accepted_at)
  values (v_user, coalesce(v_role, 'client'), p_version, v_now);

  update public.profiles
  set legal_accepted_version = p_version, legal_accepted_at = v_now, updated_at = v_now
  where user_id = v_user;

  return jsonb_build_object('version', p_version, 'acceptedAt', v_now);
end;
$$;

revoke all on function public.accept_konjo_legal_terms(text) from public, anon;
grant execute on function public.accept_konjo_legal_terms(text) to authenticated, service_role;

commit;

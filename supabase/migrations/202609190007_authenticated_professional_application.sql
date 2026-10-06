begin;

-- Mobile clients submit through an ownership-bound command. The existing
-- service-role command remains the single transactional implementation.
create or replace function public.submit_my_professional_application(
  p_application_reference text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  professional_id uuid := auth.uid();
begin
  if professional_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = professional_id and account_role = 'professional'
  ) then
    raise exception 'professional account required' using errcode = '42501';
  end if;
  if p_application_reference !~ '^KJ-PRO-[A-Z0-9-]{8,40}$' then
    raise exception 'invalid application reference' using errcode = '22023';
  end if;

  return public.submit_professional_application(
    professional_id,
    p_application_reference,
    p_payload,
    now()
  );
end;
$$;

create or replace function public.get_my_professional_application()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  professional_id uuid := auth.uid();
begin
  if professional_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return public.get_professional_application(professional_id);
end;
$$;

revoke all on function public.submit_my_professional_application(text, jsonb)
  from public, anon;
revoke all on function public.get_my_professional_application()
  from public, anon;
grant execute on function public.submit_my_professional_application(text, jsonb)
  to authenticated;
grant execute on function public.get_my_professional_application()
  to authenticated;

commit;

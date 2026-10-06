begin;

alter table public.professional_applications
  add column if not exists gender text not null default 'unspecified';
alter table public.professional_applications
  drop constraint if exists professional_applications_gender_check;
alter table public.professional_applications
  add constraint professional_applications_gender_check
  check (gender in ('female', 'male', 'unspecified'));

alter table public.professional_profiles
  add column if not exists gender text not null default 'unspecified';
alter table public.professional_profiles
  drop constraint if exists professional_profiles_gender_check;
alter table public.professional_profiles
  add constraint professional_profiles_gender_check
  check (gender in ('female', 'male', 'unspecified'));

-- Include gender in the existing application projection used by professionals
-- and administrators. Older applications safely default to unspecified.
alter function private.professional_application_api(uuid)
  rename to professional_application_api_without_gender;

create function private.professional_application_api(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when base.application is null then null else
    base.application || jsonb_build_object(
      'profile', (base.application -> 'profile') || jsonb_build_object('gender', application.gender)
    )
  end
  from (select private.professional_application_api_without_gender(p_professional_id) as application) base
  left join public.professional_applications application on application.professional_id = p_professional_id;
$$;

revoke all on function private.professional_application_api(uuid) from public, anon, authenticated;
grant execute on function private.professional_application_api(uuid) to service_role;

alter function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  rename to submit_professional_application_without_gender;

create function public.submit_professional_application(
  p_professional_id uuid,
  p_application_reference text,
  p_payload jsonb,
  p_submitted_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  selected_gender text := p_payload #>> '{profile,gender}';
begin
  if selected_gender not in ('female', 'male', 'unspecified') then
    raise exception 'gender is required' using errcode = '22023';
  end if;
  result := public.submit_professional_application_without_gender(
    p_professional_id, p_application_reference, p_payload, p_submitted_at
  );
  if result ->> 'result' <> 'submitted' then return result; end if;
  update public.professional_applications
  set gender = selected_gender, updated_at = now()
  where professional_id = p_professional_id;
  update public.professional_profiles
  set gender = selected_gender, updated_at = now()
  where professional_id = p_professional_id;
  return jsonb_build_object('result', 'submitted', 'application', private.professional_application_api(p_professional_id));
end;
$$;

alter function public.update_my_professional_profile(jsonb)
  rename to update_my_professional_profile_without_gender;

create function public.update_my_professional_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid := auth.uid();
  selected_gender text := p_payload #>> '{profile,gender}';
begin
  if selected_gender not in ('female', 'male', 'unspecified') then
    raise exception 'gender is required' using errcode = '22023';
  end if;
  perform public.update_my_professional_profile_without_gender(p_payload);
  update public.professional_applications
  set gender = selected_gender, updated_at = now()
  where professional_id = v_professional_id;
  update public.professional_profiles
  set gender = selected_gender, updated_at = now()
  where professional_id = v_professional_id;
  return private.professional_application_api(v_professional_id);
end;
$$;

revoke all on function public.submit_professional_application(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.submit_professional_application(uuid, text, jsonb, timestamptz) to service_role;
revoke all on function public.update_my_professional_profile(jsonb) from public, anon;
grant execute on function public.update_my_professional_profile(jsonb) to authenticated;

commit;

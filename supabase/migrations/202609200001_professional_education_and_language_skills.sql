begin;

alter table public.professional_applications
  add column if not exists education_level text not null default 'secondary',
  add column if not exists language_skills jsonb not null default '[]'::jsonb;

update public.professional_applications application
set language_skills = coalesce((
  select jsonb_agg(jsonb_build_object(
    'language', language,
    'proficiency', 'conversational'
  ) order by language)
  from unnest(application.spoken_languages) language
), '[]'::jsonb)
where application.language_skills = '[]'::jsonb;

alter table public.professional_applications
  drop constraint if exists professional_applications_education_level_check,
  drop constraint if exists professional_applications_language_skills_check;

alter table public.professional_applications
  add constraint professional_applications_education_level_check
    check (education_level in ('secondary', 'certificate', 'diploma', 'bachelors', 'postgraduate')),
  add constraint professional_applications_language_skills_check
    check (jsonb_typeof(language_skills) = 'array' and jsonb_array_length(language_skills) between 1 and 7);

create or replace function private.valid_professional_qualifications(p_profile jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(p_profile ->> 'educationLevel', '') in (
      'secondary', 'certificate', 'diploma', 'bachelors', 'postgraduate'
    )
    and jsonb_typeof(p_profile -> 'languageSkills') = 'array'
    and jsonb_array_length(p_profile -> 'languageSkills') between 1 and 7
    and not exists (
      select 1
      from jsonb_array_elements(p_profile -> 'languageSkills') skill
      where coalesce(skill ->> 'language', '') not in (
          'Amharic', 'Afaan Oromo', 'Tigrinya', 'Somali', 'English', 'Arabic', 'French'
        )
        or coalesce(skill ->> 'proficiency', '') not in (
          'basic', 'conversational', 'fluent', 'native'
        )
    )
    and (
      select count(*) = count(distinct skill ->> 'language')
      from jsonb_array_elements(p_profile -> 'languageSkills') skill
    );
$$;

alter function private.professional_application_api(uuid)
  rename to professional_application_api_without_qualifications;

create function private.professional_application_api(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when base.application is null then null else
    base.application || jsonb_build_object(
      'profile', (base.application -> 'profile') || jsonb_build_object(
        'educationLevel', application.education_level,
        'languageSkills', application.language_skills
      )
    ) end
  from (
    select private.professional_application_api_without_qualifications(p_professional_id) as application
  ) base
  left join public.professional_applications application
    on application.professional_id = p_professional_id;
$$;

alter function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  rename to submit_professional_application_without_qualifications;

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
begin
  if not private.valid_professional_qualifications(p_payload -> 'profile') then
    raise exception 'education level and language proficiency are required' using errcode = '22023';
  end if;

  result := public.submit_professional_application_without_qualifications(
    p_professional_id,
    p_application_reference,
    p_payload || jsonb_build_object(
      'profile', (p_payload -> 'profile') || jsonb_build_object(
        'languages', (
          select jsonb_agg(skill ->> 'language')
          from jsonb_array_elements(p_payload #> '{profile,languageSkills}') skill
        )
      )
    ),
    p_submitted_at
  );

  if result ->> 'result' <> 'submitted' then
    return result;
  end if;

  update public.professional_applications
  set education_level = p_payload #>> '{profile,educationLevel}',
      language_skills = p_payload #> '{profile,languageSkills}',
      updated_at = now()
  where professional_id = p_professional_id;

  return jsonb_build_object(
    'result', 'submitted',
    'application', private.professional_application_api(p_professional_id)
  );
end;
$$;

alter function public.update_my_professional_profile(jsonb)
  rename to update_my_professional_profile_without_qualifications;

create function public.update_my_professional_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid := auth.uid();
begin
  if not private.valid_professional_qualifications(p_payload -> 'profile') then
    raise exception 'education level and language proficiency are required' using errcode = '22023';
  end if;

  perform public.update_my_professional_profile_without_qualifications(
    (p_payload -> 'profile') || (p_payload - 'profile') || jsonb_build_object(
      'languages', (
        select jsonb_agg(skill ->> 'language')
        from jsonb_array_elements(p_payload #> '{profile,languageSkills}') skill
      )
    )
  );

  update public.professional_applications
  set education_level = p_payload #>> '{profile,educationLevel}',
      language_skills = p_payload #> '{profile,languageSkills}',
      updated_at = now()
  where professional_id = v_professional_id;

  return private.professional_application_api(v_professional_id);
end;
$$;

alter function public.list_marketplace_professionals(jsonb, date)
  rename to list_marketplace_professionals_without_qualifications;

create function public.list_marketplace_professionals(
  p_filters jsonb,
  p_today date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    professional.value || jsonb_build_object(
      'educationLevel', application.education_level,
      'languageSkills', application.language_skills
    )
    order by professional.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.list_marketplace_professionals_without_qualifications(p_filters, p_today)
  ) with ordinality professional(value, ordinality)
  join public.professional_applications application
    on application.professional_id = (professional.value ->> 'id')::uuid;
$$;

revoke all on function private.valid_professional_qualifications(jsonb) from public, anon, authenticated;
grant execute on function private.valid_professional_qualifications(jsonb) to service_role;
revoke all on function private.professional_application_api(uuid) from public, anon, authenticated;
grant execute on function private.professional_application_api(uuid) to service_role;

revoke all on function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  to service_role;

revoke all on function public.update_my_professional_profile(jsonb) from public, anon;
grant execute on function public.update_my_professional_profile(jsonb) to authenticated;

revoke all on function public.list_marketplace_professionals(jsonb, date)
  from public, anon, authenticated;
grant execute on function public.list_marketplace_professionals(jsonb, date)
  to anon, authenticated, service_role;

commit;

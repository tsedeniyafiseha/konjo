begin;

-- Expat clients also look for Italian-speaking professionals. Accept Italian as
-- a spoken language and raise the per-application skill limit to match the
-- eight supported languages.
alter table public.professional_applications
  drop constraint if exists professional_applications_language_skills_check;

alter table public.professional_applications
  add constraint professional_applications_language_skills_check
    check (jsonb_typeof(language_skills) = 'array' and jsonb_array_length(language_skills) between 1 and 8);

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
    and jsonb_array_length(p_profile -> 'languageSkills') between 1 and 8
    and not exists (
      select 1
      from jsonb_array_elements(p_profile -> 'languageSkills') skill
      where coalesce(skill ->> 'language', '') not in (
          'Amharic', 'Afaan Oromo', 'Tigrinya', 'Somali', 'English', 'Arabic', 'French', 'Italian'
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

revoke all on function private.valid_professional_qualifications(jsonb) from public, anon, authenticated;
grant execute on function private.valid_professional_qualifications(jsonb) to service_role;

commit;

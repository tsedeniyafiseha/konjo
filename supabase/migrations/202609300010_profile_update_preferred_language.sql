begin;

-- Profile → Language on the professional app saves through the profile update,
-- but the update chain never wrote preferred_language, so the choice silently
-- stayed at the registration language. Wrap the current update (renamed, not
-- redefined) and persist the language with it. Notifications and every
-- professional screen follow professional_applications.preferred_language.
alter function public.update_my_professional_profile(jsonb)
  rename to update_my_professional_profile_without_language;

create function public.update_my_professional_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid := auth.uid();
  v_language text := p_payload ->> 'preferredLanguage';
begin
  if v_language is not null and v_language not in ('am', 'om', 'en') then
    raise exception 'unsupported preferred language' using errcode = '22023';
  end if;
  perform public.update_my_professional_profile_without_language(p_payload);
  if v_language is not null then
    update public.professional_applications
    set preferred_language = v_language, updated_at = now()
    where professional_id = v_professional_id;
  end if;
  return private.professional_application_api(v_professional_id);
end;
$$;
revoke all on function public.update_my_professional_profile_without_language(jsonb) from public, anon, authenticated;
grant execute on function public.update_my_professional_profile_without_language(jsonb) to service_role;
revoke all on function public.update_my_professional_profile(jsonb) from public, anon;
grant execute on function public.update_my_professional_profile(jsonb) to authenticated, service_role;

commit;

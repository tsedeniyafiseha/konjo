begin;

-- The renamed pre-validation wrappers stayed callable by signed-in users after
-- each migration layered a stricter public.update_my_professional_profile on
-- top. Only the current wrapper (which runs as the owner) may reach them, so a
-- professional cannot skip the gender and language-skill validation.
revoke all on function public.update_my_professional_profile_without_gender(jsonb) from public, anon, authenticated;
revoke all on function public.update_my_professional_profile_without_qualifications(jsonb) from public, anon, authenticated;

commit;

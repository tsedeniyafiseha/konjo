begin;

-- ---------------------------------------------------------------------------
-- Publish the professional's registered gender to clients.
--
-- Gender is collected once at registration (professional_profiles.gender) and
-- is now part of the marketplace listing, so the app can show it on the
-- professional's profile and let clients filter by it. This replaces the old
-- per-booking "female only" request, which the app no longer offers.
--
-- Same wrapper pattern as 202609200001: the existing function is renamed and
-- the new one decorates each row with `gender`.
-- ---------------------------------------------------------------------------

alter function public.list_marketplace_professionals(jsonb, date)
  rename to list_marketplace_professionals_without_gender;

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
      'gender', coalesce(profile.gender, 'unspecified')
    )
    order by professional.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.list_marketplace_professionals_without_gender(p_filters, p_today)
  ) with ordinality professional(value, ordinality)
  left join public.professional_profiles profile
    on profile.professional_id = (professional.value ->> 'id')::uuid;
$$;

-- Only the public entry point is callable by clients; the inner function is
-- reached through it.
revoke all on function public.list_marketplace_professionals_without_gender(jsonb, date)
  from public, anon, authenticated;
grant execute on function public.list_marketplace_professionals_without_gender(jsonb, date)
  to service_role;
revoke all on function public.list_marketplace_professionals(jsonb, date)
  from public, anon, authenticated;
grant execute on function public.list_marketplace_professionals(jsonb, date)
  to anon, authenticated, service_role;

commit;

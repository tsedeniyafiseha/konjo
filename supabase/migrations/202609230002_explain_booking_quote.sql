begin;

-- ---------------------------------------------------------------------------
-- Explain why a booking request cannot be quoted.
--
-- `quote_marketplace_booking` answers null for every unavailable combination,
-- which leaves the client with one vague message. This companion function
-- mirrors the quote's checks in the same order and names the first one that
-- fails, so the API can tell the client exactly what to change. It returns
-- null when the quote would succeed. It never changes data.
-- ---------------------------------------------------------------------------
create or replace function public.explain_marketplace_booking_quote(p_input jsonb)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_professional_id uuid := (p_input ->> 'professionalId')::uuid;
  v_client_id uuid := (p_input ->> 'clientId')::uuid;
  service_record record;
  availability jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = v_client_id and account_role = 'client'
  ) then return 'client_unavailable'; end if;

  if not exists (
    select 1 from public.professional_profiles profile
    where profile.professional_id = v_professional_id
      and profile.approval_status = 'approved'
      and not profile.is_hidden
      and profile.is_available
  ) then return 'professional_unavailable'; end if;

  select service.id, service.name, service.price,
    profile.female_only_eligible, category.slug as category_slug
  into service_record
  from public.professional_services service
  join public.professional_profiles profile on profile.professional_id = service.professional_id
  join public.service_categories category on category.id = service.category_id
  where service.professional_id = v_professional_id
    and service.active
    and service.id::text = p_input ->> 'serviceId';
  if not found then return 'service_unavailable'; end if;

  if coalesce((p_input ->> 'femaleOnly')::boolean, false)
    and not service_record.female_only_eligible
  then return 'female_only_unavailable'; end if;

  if not exists (
    select 1 from public.zones zone
    where zone.active
      and lower(zone.name) = lower(trim(p_input ->> 'addressZone'))
  ) then return 'zone_unavailable'; end if;

  if service_record.category_slug = 'massage'
    and not exists (
      select 1 from public.client_identity_verifications
      where client_id = v_client_id
    )
  then return 'identity_required'; end if;

  availability := private.professional_availability_api(
    v_professional_id,
    (p_input ->> 'dateIso')::date,
    service_record.id::text,
    null
  );
  if not coalesce(availability -> 'slots', '[]'::jsonb) ? (p_input ->> 'time') then
    return 'time_unavailable';
  end if;

  return null;
end;
$$;

revoke all on function public.explain_marketplace_booking_quote(jsonb) from public, anon, authenticated;
grant execute on function public.explain_marketplace_booking_quote(jsonb) to service_role;

commit;

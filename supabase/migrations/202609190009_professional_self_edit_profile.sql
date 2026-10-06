begin;

-- Approved professionals can update everything on their profile except the
-- specialty they were approved for: name, bio, experience, languages, base
-- location, working hours, travel zones, same-day preference and the prices,
-- durations and notes of their services (all within their approved specialty).
create or replace function public.update_my_professional_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid := auth.uid();
  v_specialty text;
  v_category_id uuid;
  v_base_zone_id uuid;
  v_zone_id uuid;
  v_display_name text := trim(coalesce(p_payload ->> 'displayName', ''));
  v_bio text := trim(coalesce(p_payload ->> 'bio', ''));
  v_email text := nullif(trim(coalesce(p_payload ->> 'email', '')), '');
  v_years integer;
  v_languages text[];
  service_item jsonb;
  day_item jsonb;
  zone_item jsonb;
  v_now timestamptz := now();
begin
  if v_professional_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.specialty into v_specialty
  from public.professional_profiles profile
  join public.professional_applications application
    on application.professional_id = profile.professional_id
  where profile.professional_id = v_professional_id
    and profile.approval_status = 'approved'
    and application.status = 'approved';
  if v_specialty is null then
    raise exception 'only approved professionals can edit their profile' using errcode = '42501';
  end if;

  select id into v_category_id from public.service_categories
  where slug = lower(v_specialty) and active;
  if v_category_id is null then
    raise exception 'your service category is not available' using errcode = '22023';
  end if;

  if length(v_display_name) not between 2 and 60 then
    raise exception 'display name must be 2 to 60 characters' using errcode = '22023';
  end if;
  if length(v_bio) not between 30 and 280 then
    raise exception 'introduction must be 30 to 280 characters' using errcode = '22023';
  end if;
  if coalesce(p_payload ->> 'yearsExperience', '') !~ '^\d{1,2}$' then
    raise exception 'years of experience must be a number from 0 to 60' using errcode = '22023';
  end if;
  v_years := (p_payload ->> 'yearsExperience')::integer;
  if v_years > 60 then
    raise exception 'years of experience must be a number from 0 to 60' using errcode = '22023';
  end if;

  v_languages := array(
    select distinct value from jsonb_array_elements_text(coalesce(p_payload -> 'languages', '[]'::jsonb)) value
    where value in ('Amharic', 'Afaan Oromo', 'English')
  );
  if cardinality(v_languages) = 0 then
    raise exception 'choose at least one language' using errcode = '22023';
  end if;

  select id into v_base_zone_id from public.zones
  where lower(name) = lower(trim(coalesce(p_payload ->> 'baseZone', ''))) and active;
  if v_base_zone_id is null then
    raise exception 'base location is not available' using errcode = '22023';
  end if;

  if coalesce(jsonb_array_length(p_payload -> 'services'), 0) not between 1 and 20
    or coalesce(jsonb_array_length(p_payload -> 'workingDays'), 0) <> 7
    or coalesce(jsonb_array_length(p_payload -> 'travelZones'), 0) = 0
  then
    raise exception 'services, working days and travel zones are required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_payload -> 'travelZones') item
    where coalesce((item ->> 'active')::boolean, false)
  ) then
    raise exception 'choose at least one travel zone' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload -> 'services') item
    where length(trim(coalesce(item ->> 'name', ''))) < 2
      or coalesce((item ->> 'price')::numeric, 0) <= 0
      or coalesce((item ->> 'durationMinutes')::integer, 0) not between 15 and 600
  ) then
    raise exception 'every service needs a name, a price and a duration' using errcode = '22023';
  end if;

  update public.professional_profiles
  set display_name = v_display_name,
      bio = v_bio,
      base_zone_id = v_base_zone_id,
      updated_at = v_now
  where professional_id = v_professional_id;

  update public.professional_applications
  set contact_email = v_email,
      years_experience = v_years,
      spoken_languages = v_languages,
      same_day_bookings = coalesce((p_payload ->> 'sameDayBookings')::boolean, same_day_bookings),
      updated_at = v_now
  where professional_id = v_professional_id;

  -- Services stay in the approved specialty; retired services are kept
  -- inactive so existing bookings keep their references.
  update public.professional_services
  set active = false, updated_at = v_now
  where professional_id = v_professional_id;
  for service_item in select value from jsonb_array_elements(p_payload -> 'services') loop
    update public.professional_services set
      category_id = v_category_id,
      name = trim(service_item ->> 'name'),
      duration_minutes = (service_item ->> 'durationMinutes')::integer,
      price = (service_item ->> 'price')::numeric,
      note = coalesce(service_item ->> 'note', ''),
      popular = coalesce((service_item ->> 'popular')::boolean, false),
      active = true,
      updated_at = v_now
    where professional_id = v_professional_id
      and application_service_reference = service_item ->> 'id';
    if not found then
      insert into public.professional_services (
        professional_id, application_service_reference, category_id, name,
        duration_minutes, price, note, popular, active, created_at, updated_at
      ) values (
        v_professional_id,
        service_item ->> 'id',
        v_category_id,
        trim(service_item ->> 'name'),
        (service_item ->> 'durationMinutes')::integer,
        (service_item ->> 'price')::numeric,
        coalesce(service_item ->> 'note', ''),
        coalesce((service_item ->> 'popular')::boolean, false),
        true,
        v_now,
        v_now
      );
    end if;
  end loop;

  delete from public.professional_working_hours where professional_id = v_professional_id;
  for day_item in select value from jsonb_array_elements(p_payload -> 'workingDays') loop
    insert into public.professional_working_hours (
      professional_id, weekday, enabled, starts_at, ends_at, display_hours
    ) values (
      v_professional_id,
      (day_item ->> 'weekday')::smallint,
      (day_item ->> 'enabled')::boolean,
      nullif(day_item ->> 'startsAt', '')::time,
      nullif(day_item ->> 'endsAt', '')::time,
      day_item ->> 'hours'
    );
  end loop;

  delete from public.professional_travel_zones where professional_id = v_professional_id;
  for zone_item in select value from jsonb_array_elements(p_payload -> 'travelZones') loop
    select id into v_zone_id from public.zones where slug = zone_item ->> 'id' and active;
    if v_zone_id is null then
      raise exception 'travel zone is not available' using errcode = '22023';
    end if;
    insert into public.professional_travel_zones (professional_id, zone_id, active)
    values (v_professional_id, v_zone_id, (zone_item ->> 'active')::boolean);
  end loop;

  return private.professional_application_api(v_professional_id);
end;
$$;

revoke all on function public.update_my_professional_profile(jsonb) from public, anon;
grant execute on function public.update_my_professional_profile(jsonb) to authenticated;

-- Active zones the professional can pick when editing (includes zones that
-- were added after they registered).
create or replace function public.list_active_zones()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', slug, 'label', name) order by name), '[]'::jsonb)
  from public.zones where active;
$$;

revoke all on function public.list_active_zones() from public, anon;
grant execute on function public.list_active_zones() to authenticated;

commit;

begin;

create or replace function private.professional_availability_api(
  p_professional_id uuid,
  p_date date,
  p_service_id text default null,
  p_exclude_booking_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_available boolean;
  day_enabled boolean;
  working_start time;
  working_end time;
  requested_duration integer := 60;
  slot_record record;
  slot_start timestamptz;
  slot_end timestamptz;
  slots jsonb := '[]'::jsonb;
begin
  select profile.is_available
  into profile_available
  from public.professional_profiles profile
  where profile.professional_id = p_professional_id
    and profile.approval_status = 'approved'
    and not profile.is_hidden;

  if not found then return null; end if;

  if p_service_id is not null then
    select service.duration_minutes
    into requested_duration
    from public.professional_services service
    where service.professional_id = p_professional_id
      and service.active
      and (
        service.id::text = p_service_id
        or service.application_service_reference = p_service_id
      )
    limit 1;
    if not found then return null; end if;
  end if;

  select hours.enabled, hours.starts_at, hours.ends_at
  into day_enabled, working_start, working_end
  from public.professional_working_hours hours
  where hours.professional_id = p_professional_id
    and hours.weekday = extract(dow from p_date)::smallint;

  if not coalesce(profile_available, false)
    or not coalesce(day_enabled, false)
    or working_start is null
    or working_end is null
  then
    return jsonb_build_object(
      'professionalId', p_professional_id,
      'dateIso', p_date::text,
      'available', false,
      'slots', slots
    );
  end if;

  for slot_record in
    select * from (values
      ('9:00 AM', time '09:00'),
      ('10:30 AM', time '10:30'),
      ('12:00 PM', time '12:00'),
      ('2:30 PM', time '14:30'),
      ('4:00 PM', time '16:00'),
      ('5:30 PM', time '17:30')
    ) as candidate(label, local_time)
  loop
    slot_start := (p_date + slot_record.local_time) at time zone 'Africa/Addis_Ababa';
    slot_end := slot_start + make_interval(mins => requested_duration);
    if slot_record.local_time < working_start
      or (slot_record.local_time + make_interval(mins => requested_duration))::time > working_end
      or slot_start <= now()
    then
      continue;
    end if;
    if exists (
      select 1 from public.bookings booking
      where booking.professional_id = p_professional_id
        and booking.status <> 'cancelled'
        and (p_exclude_booking_id is null or booking.id::text <> p_exclude_booking_id)
        and booking.scheduled_start < slot_end
        and booking.scheduled_start + make_interval(mins => booking.duration_minutes) > slot_start
    ) then
      continue;
    end if;
    slots := slots || to_jsonb(slot_record.label);
  end loop;

  return jsonb_build_object(
    'professionalId', p_professional_id,
    'dateIso', p_date::text,
    'available', jsonb_array_length(slots) > 0,
    'slots', slots
  );
end;
$$;

revoke all on function private.professional_availability_api(uuid, date, text, text)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.professional_availability_api(uuid, date, text, text)
  to service_role;

create or replace function public.get_marketplace_professional_availability(
  p_professional_id uuid,
  p_date date,
  p_service_id text default null,
  p_exclude_booking_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.professional_availability_api(
    p_professional_id, p_date, p_service_id, p_exclude_booking_id
  );
$$;

create or replace function public.list_marketplace_professionals(
  p_filters jsonb,
  p_today date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  profile record;
  result jsonb := '[]'::jsonb;
  availability jsonb;
  next_slot text;
  offset_days integer;
  candidate_date date;
  primary_category text;
begin
  for profile in
    select professional.*, base_zone.name as base_zone_name
    from public.professional_profiles professional
    left join public.zones base_zone on base_zone.id = professional.base_zone_id
    where professional.approval_status = 'approved'
      and not professional.is_hidden
      and (
        nullif(trim(p_filters ->> 'category'), '') is null
        or exists (
          select 1 from public.professional_services service
          join public.service_categories category on category.id = service.category_id
          where service.professional_id = professional.professional_id
            and service.active
            and category.slug = lower(trim(p_filters ->> 'category'))
        )
      )
      and (
        nullif(trim(p_filters ->> 'zone'), '') is null
        or exists (
          select 1 from public.professional_travel_zones travel
          join public.zones zone on zone.id = travel.zone_id
          where travel.professional_id = professional.professional_id
            and travel.active
            and lower(zone.name) = lower(trim(p_filters ->> 'zone'))
        )
      )
      and (
        p_filters ->> 'featured' is null
        or professional.featured = (p_filters ->> 'featured')::boolean
      )
      and (
        p_filters ->> 'available' is null
        or professional.is_available = (p_filters ->> 'available')::boolean
      )
      and (
        nullif(trim(p_filters ->> 'query'), '') is null
        or lower(concat_ws(' ',
          professional.display_name,
          professional.specialty,
          base_zone.name
        )) like '%' || lower(trim(p_filters ->> 'query')) || '%'
        or exists (
          select 1 from public.professional_services service
          where service.professional_id = professional.professional_id
            and service.active
            and lower(service.name) like '%' || lower(trim(p_filters ->> 'query')) || '%'
        )
        or exists (
          select 1 from public.professional_travel_zones travel
          join public.zones zone on zone.id = travel.zone_id
          where travel.professional_id = professional.professional_id
            and travel.active
            and lower(zone.name) like '%' || lower(trim(p_filters ->> 'query')) || '%'
        )
      )
    order by professional.featured desc, professional.display_name
  loop
    select category.slug into primary_category
    from public.professional_services service
    join public.service_categories category on category.id = service.category_id
    where service.professional_id = profile.professional_id and service.active
    order by service.created_at, service.id
    limit 1;
    primary_category := coalesce(primary_category, lower(profile.specialty));

    availability := private.professional_availability_api(
      profile.professional_id, p_today, null, null
    );
    next_slot := null;
    for offset_days in 0..6 loop
      candidate_date := p_today + offset_days;
      availability := private.professional_availability_api(
        profile.professional_id, candidate_date, null, null
      );
      if coalesce(jsonb_array_length(availability -> 'slots'), 0) > 0 then
        next_slot := case
          when offset_days = 0 then availability #>> '{slots,0}'
          when offset_days = 1 then 'Tomorrow ' || (availability #>> '{slots,0}')
          else trim(to_char(candidate_date, 'Dy')) || ' ' || (availability #>> '{slots,0}')
        end;
        exit;
      end if;
    end loop;

    availability := private.professional_availability_api(
      profile.professional_id, p_today, null, null
    );
    result := result || jsonb_build_array(jsonb_build_object(
      'id', profile.professional_id,
      'displayName', profile.display_name,
      'specialty', profile.specialty,
      'category', primary_category,
      'baseZone', coalesce(profile.base_zone_name, ''),
      'bio', profile.bio,
      'yearsExperience', coalesce((
        select application.years_experience
        from public.professional_applications application
        where application.professional_id = profile.professional_id
      ), 0),
      'languages', coalesce((
        select to_jsonb(application.spoken_languages)
        from public.professional_applications application
        where application.professional_id = profile.professional_id
      ), '[]'::jsonb),
      'rating', coalesce(profile.average_rating, 0),
      'reviewCount', profile.review_count,
      'available', profile.is_available,
      'availableToday', coalesce((availability ->> 'available')::boolean, false),
      'nextAvailableSlot', next_slot,
      'featured', profile.featured,
      'femaleOnlyEligible', profile.female_only_eligible,
      'travelZones', coalesce((
        select jsonb_agg(zone.name order by zone.name)
        from public.professional_travel_zones travel
        join public.zones zone on zone.id = travel.zone_id
        where travel.professional_id = profile.professional_id and travel.active
      ), '[]'::jsonb),
      'workingDays', coalesce((
        select jsonb_agg(jsonb_build_object(
          'day', case hours.weekday
            when 0 then 'Sunday' when 1 then 'Monday' when 2 then 'Tuesday'
            when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday'
            else 'Saturday' end,
          'enabled', hours.enabled
        ) order by case when hours.weekday = 0 then 7 else hours.weekday end)
        from public.professional_working_hours hours
        where hours.professional_id = profile.professional_id
      ), '[]'::jsonb),
      'services', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', service.id,
          'name', service.name,
          'price', service.price,
          'durationMinutes', service.duration_minutes
        ) order by service.created_at, service.id)
        from public.professional_services service
        where service.professional_id = profile.professional_id and service.active
      ), '[]'::jsonb)
    ));
  end loop;
  return result;
end;
$$;

create or replace function public.list_marketplace_zones()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', zone.slug,
    'label', zone.name,
    'travelFee', zone.travel_fee
  ) order by zone.name), '[]'::jsonb)
  from public.zones zone where zone.active;
$$;

create or replace function public.list_marketplace_categories(p_active_only boolean default true)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.id,
    'slug', category.slug,
    'name', category.name,
    'active', category.active,
    'sortOrder', category.sort_order,
    'updatedAt', category.updated_at
  ) order by category.sort_order, category.name), '[]'::jsonb)
  from public.service_categories category
  where not p_active_only or category.active;
$$;

create or replace function public.list_marketplace_promotions()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', promotion.id,
    'code', promotion.code,
    'description', promotion.description,
    'discountPercent', promotion.discount_percent,
    'active', promotion.active,
    'startsAt', promotion.starts_at,
    'endsAt', promotion.ends_at,
    'createdAt', promotion.created_at
  ) order by promotion.created_at desc), '[]'::jsonb)
  from public.promotions promotion;
$$;

create or replace function public.find_marketplace_zone(p_zone text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', zone.slug,
    'label', zone.name,
    'travelFee', zone.travel_fee
  ) from public.zones zone
  where zone.active and lower(zone.name) = lower(trim(p_zone));
$$;

create or replace function public.booking_requires_client_identity(
  p_client_id uuid,
  p_professional_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.professional_profiles profile
    where profile.professional_id = p_professional_id
      and profile.approval_status = 'approved'
      and not profile.is_hidden
      and (
        lower(profile.specialty) = 'massage'
        or exists (
          select 1 from public.professional_services service
          join public.service_categories category on category.id = service.category_id
          where service.professional_id = profile.professional_id
            and service.active and category.slug = 'massage'
        )
      )
      and not exists (
        select 1 from public.client_identity_verifications verification
        where verification.client_id = p_client_id
      )
  );
$$;

create or replace function public.record_client_identity_verification(
  p_client_id uuid,
  p_last_four text,
  p_verified_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_last_four !~ '^[0-9]{4}$' then
    raise exception 'invalid identity verification result' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = p_client_id and account_role = 'client'
  ) then
    raise exception 'client account not found' using errcode = 'P0002';
  end if;
  insert into public.client_identity_verifications (client_id, fayda_last_four, verified_at)
  values (p_client_id, p_last_four, p_verified_at)
  on conflict (client_id) do update
  set fayda_last_four = excluded.fayda_last_four,
      verified_at = excluded.verified_at;
  return jsonb_build_object(
    'verified', true,
    'faydaLastFour', p_last_four,
    'verifiedAt', p_verified_at
  );
end;
$$;

create or replace function public.get_client_identity_verification(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when verification.client_id is null
    then jsonb_build_object('verified', false, 'faydaLastFour', null, 'verifiedAt', null)
    else jsonb_build_object(
      'verified', true,
      'faydaLastFour', verification.fayda_last_four,
      'verifiedAt', verification.verified_at
    ) end
  from (select p_client_id as client_id) requested
  left join public.client_identity_verifications verification
    on verification.client_id = requested.client_id;
$$;

revoke all on function public.get_marketplace_professional_availability(uuid, date, text, text)
  from public, anon, authenticated;
revoke all on function public.list_marketplace_professionals(jsonb, date)
  from public, anon, authenticated;
revoke all on function public.list_marketplace_zones()
  from public, anon, authenticated;
revoke all on function public.list_marketplace_categories(boolean)
  from public, anon, authenticated;
revoke all on function public.list_marketplace_promotions()
  from public, anon, authenticated;
revoke all on function public.find_marketplace_zone(text)
  from public, anon, authenticated;
revoke all on function public.booking_requires_client_identity(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_client_identity_verification(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_client_identity_verification(uuid)
  from public, anon, authenticated;

grant execute on function public.get_marketplace_professional_availability(uuid, date, text, text)
  to service_role;
grant execute on function public.list_marketplace_professionals(jsonb, date)
  to service_role;
grant execute on function public.list_marketplace_zones()
  to service_role;
grant execute on function public.list_marketplace_categories(boolean)
  to service_role;
grant execute on function public.list_marketplace_promotions()
  to service_role;
grant execute on function public.find_marketplace_zone(text)
  to service_role;
grant execute on function public.booking_requires_client_identity(uuid, uuid)
  to service_role;
grant execute on function public.record_client_identity_verification(uuid, text, timestamptz)
  to service_role;
grant execute on function public.get_client_identity_verification(uuid)
  to service_role;

commit;

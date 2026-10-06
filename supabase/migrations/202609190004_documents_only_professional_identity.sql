begin;

-- Professional identity is reviewed from private front/back document images.
-- Do not collect or retain an identity number as part of onboarding.
create or replace function private.professional_application_api(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', application.application_reference,
    'status', application.status::text,
    'submittedAt', floor(extract(epoch from application.submitted_at) * 1000)::bigint,
    'preferredLanguage', application.preferred_language,
    'profile', jsonb_build_object(
      'legalName', application.legal_name,
      'displayName', profile.display_name,
      'email', coalesce(application.contact_email, ''),
      'specialty', profile.specialty,
      'bio', profile.bio,
      'yearsExperience', application.years_experience::text,
      'languages', to_jsonb(application.spoken_languages),
      'baseZone', base_zone.name,
      'portfolioCount', profile.portfolio_count
    ),
    'identity', jsonb_build_object(
      'credentialAdded', exists (
        select 1 from public.professional_documents document
        where document.professional_id = p_professional_id
          and document.kind = 'certificate'
          and document.status <> 'rejected'
      )
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.application_service_reference,
        'category', category.name,
        'name', service.name,
        'durationMinutes', service.duration_minutes,
        'price', service.price,
        'note', service.note,
        'popular', service.popular
      ) order by service.created_at, service.id)
      from public.professional_services service
      join public.service_categories category on category.id = service.category_id
      where service.professional_id = p_professional_id
    ), '[]'::jsonb),
    'workingDays', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', case hours.weekday
          when 0 then 'Sunday' when 1 then 'Monday' when 2 then 'Tuesday'
          when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday'
          else 'Saturday' end,
        'hours', hours.display_hours,
        'enabled', hours.enabled
      ) order by case when hours.weekday = 0 then 7 else hours.weekday end)
      from public.professional_working_hours hours
      where hours.professional_id = p_professional_id
    ), '[]'::jsonb),
    'travelZones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', zone.slug,
        'label', zone.name,
        'active', travel.active
      ) order by zone.name)
      from public.professional_travel_zones travel
      join public.zones zone on zone.id = travel.zone_id
      where travel.professional_id = p_professional_id
    ), '[]'::jsonb),
    'sameDayBookings', application.same_day_bookings,
    'termsAccepted', application.terms_accepted_at is not null
  )
  from public.professional_applications application
  join public.professional_profiles profile
    on profile.professional_id = application.professional_id
  join public.zones base_zone on base_zone.id = profile.base_zone_id
  where application.professional_id = p_professional_id;
$$;

create or replace function public.submit_professional_application(
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
  existing_status public.professional_application_status;
  base_zone_id uuid;
  service_item jsonb;
  day_item jsonb;
  zone_item jsonb;
  category_id uuid;
  travel_zone_id uuid;
  uploaded_portfolio_count integer;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_professional_id and account_role = 'professional'
  ) then
    raise exception 'professional account not found' using errcode = 'P0002';
  end if;

  select status into existing_status
  from public.professional_applications
  where professional_id = p_professional_id;
  if existing_status in ('pending', 'approved', 'suspended') then
    return jsonb_build_object('result', 'not_editable');
  end if;

  if coalesce(jsonb_array_length(p_payload -> 'services'), 0) not between 1 and 20
    or coalesce(jsonb_array_length(p_payload -> 'workingDays'), 0) <> 7
    or coalesce(jsonb_array_length(p_payload -> 'travelZones'), 0) = 0
    or coalesce((p_payload ->> 'termsAccepted')::boolean, false) is not true
  then
    raise exception 'professional application payload is incomplete' using errcode = '22023';
  end if;

  select id into base_zone_id from public.zones
  where lower(name) = lower(p_payload #>> '{profile,baseZone}') and active;
  if base_zone_id is null then
    raise exception 'base zone is not available' using errcode = '22023';
  end if;

  select count(*)::integer into uploaded_portfolio_count
  from public.professional_documents
  where professional_id = p_professional_id
    and kind = 'portfolio' and status <> 'rejected';

  insert into public.professional_profiles (
    professional_id, display_name, specialty, bio, base_zone_id,
    portfolio_count, is_available, approval_status, is_hidden
  ) values (
    p_professional_id,
    trim(p_payload #>> '{profile,displayName}'),
    lower(trim(p_payload #>> '{profile,specialty}')),
    trim(p_payload #>> '{profile,bio}'),
    base_zone_id,
    uploaded_portfolio_count,
    false,
    'pending',
    false
  ) on conflict (professional_id) do update set
    display_name = excluded.display_name,
    specialty = excluded.specialty,
    bio = excluded.bio,
    base_zone_id = excluded.base_zone_id,
    portfolio_count = excluded.portfolio_count,
    is_available = false,
    approval_status = 'pending',
    updated_at = now();

  insert into public.professional_applications (
    professional_id, application_reference, legal_name, contact_email,
    preferred_language, years_experience, spoken_languages,
    same_day_bookings, terms_accepted_at, status, submitted_at
  ) values (
    p_professional_id,
    p_application_reference,
    trim(p_payload #>> '{profile,legalName}'),
    nullif(trim(p_payload #>> '{profile,email}'), ''),
    p_payload ->> 'preferredLanguage',
    (p_payload #>> '{profile,yearsExperience}')::integer,
    array(select jsonb_array_elements_text(p_payload #> '{profile,languages}')),
    (p_payload ->> 'sameDayBookings')::boolean,
    p_submitted_at,
    'pending',
    p_submitted_at
  ) on conflict (professional_id) do update set
    application_reference = excluded.application_reference,
    legal_name = excluded.legal_name,
    contact_email = excluded.contact_email,
    preferred_language = excluded.preferred_language,
    years_experience = excluded.years_experience,
    spoken_languages = excluded.spoken_languages,
    same_day_bookings = excluded.same_day_bookings,
    terms_accepted_at = excluded.terms_accepted_at,
    status = 'pending',
    submitted_at = excluded.submitted_at,
    reviewed_at = null,
    reviewed_by = null,
    admin_notes = null,
    updated_at = now();

  delete from public.professional_services where professional_id = p_professional_id;
  for service_item in select value from jsonb_array_elements(p_payload -> 'services') loop
    select id into category_id from public.service_categories
    where slug = lower(service_item ->> 'category') and active;
    if category_id is null then
      raise exception 'service category is not available' using errcode = '22023';
    end if;
    insert into public.professional_services (
      professional_id, application_service_reference, category_id, name,
      duration_minutes, price, note, popular, active
    ) values (
      p_professional_id,
      service_item ->> 'id',
      category_id,
      trim(service_item ->> 'name'),
      (service_item ->> 'durationMinutes')::integer,
      (service_item ->> 'price')::numeric,
      coalesce(service_item ->> 'note', ''),
      coalesce((service_item ->> 'popular')::boolean, false),
      true
    );
  end loop;

  delete from public.professional_working_hours where professional_id = p_professional_id;
  for day_item in select value from jsonb_array_elements(p_payload -> 'workingDays') loop
    insert into public.professional_working_hours (
      professional_id, weekday, enabled, starts_at, ends_at, display_hours
    ) values (
      p_professional_id,
      (day_item ->> 'weekday')::smallint,
      (day_item ->> 'enabled')::boolean,
      nullif(day_item ->> 'startsAt', '')::time,
      nullif(day_item ->> 'endsAt', '')::time,
      day_item ->> 'hours'
    );
  end loop;

  delete from public.professional_travel_zones where professional_id = p_professional_id;
  for zone_item in select value from jsonb_array_elements(p_payload -> 'travelZones') loop
    select id into travel_zone_id from public.zones
    where slug = zone_item ->> 'id' and active;
    if travel_zone_id is null then
      raise exception 'travel zone is not available' using errcode = '22023';
    end if;
    insert into public.professional_travel_zones (professional_id, zone_id, active)
    values (p_professional_id, travel_zone_id, (zone_item ->> 'active')::boolean);
  end loop;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'professional.application_submitted', 1, 'professional', p_professional_id::text, 1,
    p_submitted_at, p_application_reference,
    jsonb_build_object('professionalId', p_professional_id, 'applicationId', p_application_reference)
  );

  return jsonb_build_object(
    'result', 'submitted',
    'application', private.professional_application_api(p_professional_id)
  );
end;
$$;

-- Keep retained-booking account deletion compatible after removing the old
-- professional number-verification table and application snapshot column.
create or replace function public.delete_konjo_account(
  p_user_id uuid,
  p_role public.account_role,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role = 'admin' or not exists (
    select 1 from public.profiles
    where user_id = p_user_id and account_role = p_role
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.bookings
    where client_id = p_user_id or professional_id = p_user_id
  ) then
    delete from auth.users where id = p_user_id;
    if not found then return false; end if;
  else
    delete from public.notification_outbox where user_id = p_user_id;
    delete from public.client_addresses where client_id = p_user_id;
    delete from public.favorites where client_id = p_user_id;
    delete from public.notification_preferences where client_id = p_user_id;
    delete from public.device_registrations where user_id = p_user_id;
    delete from public.client_identity_verifications where client_id = p_user_id;
    delete from public.client_identity_documents where client_id = p_user_id;
    delete from public.professional_documents where professional_id = p_user_id;

    if p_role = 'client' then
      update public.bookings
      set address_label = 'Deleted account address',
          address_detail = 'Removed after account deletion',
          latitude = null,
          longitude = null,
          cancellation_reason = null,
          updated_at = p_occurred_at
      where client_id = p_user_id;

      update public.reviews
      set tags = array[]::text[], review_text = '', updated_at = p_occurred_at
      where client_id = p_user_id;

      update public.booking_disputes
      set reason = 'Removed after account deletion',
          resolution = case when status = 'open' then '' else 'Resolved before account deletion' end
      where client_id = p_user_id;
    end if;

    update public.safety_incidents
    set latitude = null,
        longitude = null,
        accuracy_meters = null,
        resolution = case when status = 'open' then '' else 'Resolved before account deletion' end
    where reported_by_id = p_user_id;

    update public.professional_profiles
    set display_name = 'Deleted professional',
        bio = '',
        portfolio_count = 0,
        is_available = false,
        featured = false,
        female_only_eligible = false,
        is_hidden = true,
        updated_at = p_occurred_at
    where professional_id = p_user_id;

    update public.professional_applications
    set legal_name = 'Deleted professional',
        contact_email = null,
        admin_notes = null,
        terms_accepted_at = null,
        updated_at = p_occurred_at
    where professional_id = p_user_id;

    update public.professional_services
    set note = '', updated_at = p_occurred_at
    where professional_id = p_user_id;

    update auth.users
    set email = 'deleted+' || replace(id::text, '-', '') || '@deleted.invalid',
        phone = null,
        banned_until = '9999-12-31 23:59:59+00',
        raw_user_meta_data = jsonb_build_object(
          'role', p_role::text,
          'full_name', 'Deleted account'
        ),
        updated_at = p_occurred_at
    where id = p_user_id;

    update public.profiles
    set full_name = 'Deleted account',
        email = null,
        phone_number = null,
        onboarding_completed_at = null,
        updated_at = p_occurred_at
    where user_id = p_user_id;
  end if;

  insert into public.domain_event_outbox (
    event_id, event_type, schema_version, aggregate_type, aggregate_id,
    aggregate_version, occurred_at, correlation_id, causation_id, payload,
    status, attempts, available_at, created_at
  ) values (
    extensions.gen_random_uuid(), 'AccountDeleted', 1, 'account', p_user_id::text,
    1, p_occurred_at, 'account:' || p_user_id::text || ':deletion', null,
    jsonb_build_object('userId', p_user_id, 'role', p_role::text),
    'pending', 0, p_occurred_at, p_occurred_at
  );

  return true;
end;
$$;

drop function if exists public.record_manual_professional_identity_submission(uuid, text, timestamptz);
drop function if exists public.record_professional_identity_verification(uuid, text, timestamptz);

alter table public.professional_applications drop column if exists fayda_last_four;
drop table if exists public.professional_identity_verifications;

revoke all on function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  to service_role;

revoke all on function public.delete_konjo_account(uuid, public.account_role, timestamptz)
  from public, anon, authenticated;
grant execute on function public.delete_konjo_account(uuid, public.account_role, timestamptz)
  to service_role;

commit;

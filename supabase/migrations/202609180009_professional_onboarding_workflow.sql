begin;

-- The backend is the only writer for verified identity and application state.
-- Mobile clients keep using their user JWT for authentication with the backend;
-- the backend invokes these commands with a server-only Supabase secret key.
create table public.professional_identity_verifications (
  professional_id uuid primary key references public.profiles (user_id) on delete cascade,
  fayda_last_four text not null check (fayda_last_four ~ '^[0-9]{4}$'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.professional_identity_verifications enable row level security;
create policy professional_identity_verifications_server_only
on public.professional_identity_verifications
for all to authenticated
using (false)
with check (false);

alter table public.professional_applications
  add column application_reference text;
update public.professional_applications
set application_reference = 'KJ-PRO-' || upper(substr(replace(professional_id::text, '-', ''), 1, 8))
where application_reference is null;
alter table public.professional_applications
  alter column application_reference set not null;
alter table public.professional_applications
  add constraint professional_applications_reference_key unique (application_reference);

alter table public.professional_services
  add column application_service_reference text;
update public.professional_services
set application_service_reference = id::text
where application_service_reference is null;
alter table public.professional_services
  alter column application_service_reference set not null;
create unique index professional_services_application_reference_idx
  on public.professional_services (professional_id, application_service_reference);

alter table public.professional_working_hours
  add column display_hours text not null default '';

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
      'faydaFin', '',
      'faydaLastFour', verification.fayda_last_four,
      'verificationStatus', 'verified',
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
  join public.professional_identity_verifications verification
    on verification.professional_id = application.professional_id
  join public.zones base_zone on base_zone.id = profile.base_zone_id
  where application.professional_id = p_professional_id;
$$;

revoke all on function private.professional_application_api(uuid)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.professional_application_api(uuid)
  to service_role;

create or replace function public.record_professional_identity_verification(
  p_professional_id uuid,
  p_last_four text,
  p_verified_at timestamptz
)
returns void
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
    where user_id = p_professional_id and account_role = 'professional'
  ) then
    raise exception 'professional account not found' using errcode = 'P0002';
  end if;

  insert into public.professional_identity_verifications (
    professional_id, fayda_last_four, verified_at
  ) values (p_professional_id, p_last_four, p_verified_at)
  on conflict (professional_id) do update
  set fayda_last_four = excluded.fayda_last_four,
      verified_at = excluded.verified_at,
      updated_at = now();
end;
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
  if not exists (
    select 1 from public.professional_identity_verifications
    where professional_id = p_professional_id
  ) then
    return jsonb_build_object('result', 'identity_not_verified');
  end if;

  select status into existing_status
  from public.professional_applications
  where professional_id = p_professional_id;
  if existing_status in ('pending', 'approved', 'suspended') then
    return jsonb_build_object('result', 'not_editable');
  end if;

  if not exists (
    select 1 from public.professional_documents
    where professional_id = p_professional_id
      and kind = 'government_id' and status <> 'rejected'
  ) or not exists (
    select 1 from public.professional_documents
    where professional_id = p_professional_id
      and kind = 'selfie' and status <> 'rejected'
  ) then
    return jsonb_build_object('result', 'documents_missing');
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
    preferred_language, years_experience, spoken_languages, fayda_last_four,
    same_day_bookings, terms_accepted_at, status, submitted_at
  ) values (
    p_professional_id,
    p_application_reference,
    trim(p_payload #>> '{profile,legalName}'),
    nullif(trim(p_payload #>> '{profile,email}'), ''),
    p_payload ->> 'preferredLanguage',
    (p_payload #>> '{profile,yearsExperience}')::integer,
    array(select jsonb_array_elements_text(p_payload #> '{profile,languages}')),
    (select fayda_last_four from public.professional_identity_verifications
      where professional_id = p_professional_id),
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
    fayda_last_four = excluded.fayda_last_four,
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

create or replace function public.get_professional_application(p_professional_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.professional_application_api(p_professional_id);
$$;

create or replace function public.list_professional_applications(
  p_status public.professional_application_status default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', application.professional_id,
    'phoneNumber', account.phone_number,
    'application', private.professional_application_api(application.professional_id)
  ) order by application.submitted_at desc), '[]'::jsonb)
  from public.professional_applications application
  join public.profiles account on account.user_id = application.professional_id
  where p_status is null or application.status = p_status;
$$;

create or replace function public.review_professional_application(
  p_admin_id uuid,
  p_professional_id uuid,
  p_action text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_status public.professional_application_status;
  application_reference text;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin'
  ) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'request-changes', 'reject') then
    raise exception 'invalid professional application review action' using errcode = '22023';
  end if;

  select case p_action
    when 'approve' then 'approved'::public.professional_application_status
    when 'reject' then 'rejected'::public.professional_application_status
    else 'changes_requested'::public.professional_application_status
  end into next_status;

  if p_action = 'approve' and (
    not exists (
      select 1 from public.professional_documents
      where professional_id = p_professional_id and kind = 'government_id' and status = 'approved'
    ) or not exists (
      select 1 from public.professional_documents
      where professional_id = p_professional_id and kind = 'selfie' and status = 'approved'
    )
  ) then
    return null;
  end if;

  update public.professional_applications
  set status = next_status,
      reviewed_at = p_occurred_at,
      reviewed_by = p_admin_id,
      updated_at = p_occurred_at
  where professional_id = p_professional_id and status = 'pending'
  returning professional_applications.application_reference into application_reference;
  if application_reference is null then
    return null;
  end if;

  update public.professional_profiles
  set approval_status = next_status,
      is_available = case when next_status = 'approved' then is_available else false end,
      portfolio_count = (
        select count(*)::integer from public.professional_documents
        where professional_id = p_professional_id
          and kind = 'portfolio' and status = 'approved'
      ),
      updated_at = p_occurred_at
  where professional_id = p_professional_id;

  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, metadata, created_at
  ) values (
    p_admin_id,
    'professional_application.' || replace(p_action, '-', '_'),
    'professional_application',
    p_professional_id::text,
    jsonb_build_object('applicationId', application_reference, 'status', next_status),
    p_occurred_at
  );

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'professional.application_' || next_status::text, 1, 'professional',
    p_professional_id::text, 2, p_occurred_at, application_reference,
    jsonb_build_object('professionalId', p_professional_id, 'applicationId', application_reference)
  );

  return private.professional_application_api(p_professional_id);
end;
$$;

revoke all on table public.professional_identity_verifications from anon, authenticated;
revoke all on function public.record_professional_identity_verification(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_professional_application(uuid)
  from public, anon, authenticated;
revoke all on function public.list_professional_applications(public.professional_application_status)
  from public, anon, authenticated;
revoke all on function public.review_professional_application(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

grant select, insert, update, delete on public.professional_identity_verifications to service_role;
grant execute on function public.record_professional_identity_verification(uuid, text, timestamptz)
  to service_role;
grant execute on function public.submit_professional_application(uuid, text, jsonb, timestamptz)
  to service_role;
grant execute on function public.get_professional_application(uuid)
  to service_role;
grant execute on function public.list_professional_applications(public.professional_application_status)
  to service_role;
grant execute on function public.review_professional_application(uuid, uuid, text, timestamptz)
  to service_role;

commit;

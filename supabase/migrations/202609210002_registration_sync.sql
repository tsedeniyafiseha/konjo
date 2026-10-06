begin;

-- Uploaded evidence, not a client-supplied completion flag, unlocks registration.
create or replace function private.client_has_identity_upload(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(bool_or(d.kind = 'passport') or
    (bool_or(d.kind = 'national_id_front') and bool_or(d.kind = 'national_id_back')), false)
  from public.client_identity_documents d
  join storage.objects o on o.bucket_id = 'client-identity-documents' and o.name = d.storage_path
  where d.client_id = p_client_id and d.status in ('pending', 'approved');
$$;
revoke all on function private.client_has_identity_upload(uuid) from public, anon, authenticated;
grant execute on function private.client_has_identity_upload(uuid) to service_role;

create or replace function private.enforce_client_registration_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_role = 'client' and new.onboarding_completed_at is not null
    and not private.client_has_identity_upload(new.user_id) then
    raise exception 'Upload your passport or both sides of your ID before completing registration.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_client_registration_identity() from public, anon, authenticated;
create trigger client_registration_identity
before insert or update of onboarding_completed_at on public.profiles
for each row execute function private.enforce_client_registration_identity();

create or replace function public.complete_client_onboarding(
  p_client_id uuid,
  p_full_name text,
  p_phone_number text,
  p_preferred_language text,
  p_address jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_zone_id uuid;
begin
  perform 1 from public.profiles
  where user_id = p_client_id and account_role = 'client'
  for update;
  if not found then return jsonb_build_object('result', 'client_not_found'); end if;

  if not private.client_has_identity_upload(p_client_id) then
    return jsonb_build_object('result', 'identity_documents_required');
  end if;

  if p_address is not null then
    select id into v_zone_id from public.zones
    where lower(name) = lower(trim(p_address ->> 'zone')) and active;
    if v_zone_id is null then
      return jsonb_build_object('result', 'service_zone_unavailable');
    end if;
  end if;

  update public.profiles set
    full_name = trim(p_full_name),
    phone_number = p_phone_number,
    preferred_language = p_preferred_language,
    onboarding_completed_at = p_occurred_at,
    updated_at = p_occurred_at
  where user_id = p_client_id;

  if p_address is not null and not exists (
    select 1 from public.client_addresses where client_id = p_client_id
  ) then
    insert into public.client_addresses (
      id, client_id, label, zone_id, address_detail, is_default, created_at, updated_at
    ) values (
      (p_address ->> 'id')::uuid, p_client_id, trim(p_address ->> 'label'),
      v_zone_id, trim(p_address ->> 'detail'), true, p_occurred_at, p_occurred_at
    );
  end if;

  return jsonb_build_object(
    'result', 'completed',
    'account', private.client_account_api(p_client_id)
  );
end;
$$;


-- Registration can finish from a phone without depending on a developer's localhost API.
create or replace function public.get_my_client_account()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where user_id = auth.uid() and account_role = 'client') then
    raise exception 'Client account required' using errcode = '42501';
  end if;
  return private.client_account_api(auth.uid());
end;
$$;

create or replace function public.complete_my_client_onboarding(p_full_name text, p_preferred_language text, p_address jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text;
  v_address jsonb;
begin
  select phone_number into v_phone from public.profiles where user_id = auth.uid() and account_role = 'client';
  if not found then raise exception 'Client account required' using errcode = '42501'; end if;
  if length(trim(p_full_name)) not between 2 and 120 or p_full_name is null
    or p_preferred_language is null or p_preferred_language not in ('en', 'am') then
    raise exception 'Enter a valid name and language' using errcode = '22023';
  end if;
  if p_address is not null then
    if jsonb_typeof(p_address) <> 'object'
      or coalesce(length(trim(p_address->>'label')), 0) not between 1 and 80
      or coalesce(length(trim(p_address->>'zone')), 0) not between 1 and 80
      or coalesce(length(trim(p_address->>'detail')), 0) not between 8 and 500 then
      raise exception 'Complete the saved address' using errcode = '22023';
    end if;
    v_address := p_address || jsonb_build_object('id', extensions.gen_random_uuid());
  end if;
  return public.complete_client_onboarding(auth.uid(), p_full_name, v_phone, p_preferred_language, v_address, now());
end;
$$;
revoke all on function public.get_my_client_account() from public, anon;
revoke all on function public.complete_my_client_onboarding(text, text, jsonb) from public, anon;
grant execute on function public.get_my_client_account() to authenticated;
grant execute on function public.complete_my_client_onboarding(text, text, jsonb) to authenticated;

-- Incomplete drafts are private and cannot publish a professional or approve evidence.
create table public.professional_registration_drafts (
  professional_id uuid primary key references public.profiles(user_id) on delete cascade,
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 65536),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.professional_registration_drafts enable row level security;
create policy professional_registration_draft_read on public.professional_registration_drafts
for select to authenticated using (professional_id = (select auth.uid()));
grant select on public.professional_registration_drafts to authenticated;
revoke insert, update, delete on public.professional_registration_drafts from authenticated, anon;

create or replace function public.save_my_professional_registration_draft(p_draft jsonb, p_expected_revision integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_revision integer;
begin
  perform 1 from public.profiles where user_id = auth.uid() and account_role = 'professional' for update;
  if not found then raise exception 'Professional account required' using errcode = '42501'; end if;
  if exists (select 1 from public.professional_applications where professional_id = auth.uid() and status not in ('rejected', 'changes_requested')) then
    raise exception 'This application is already submitted. Reload its review status.' using errcode = '55000';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_draft is null
    or jsonb_typeof(p_draft->'profile') is distinct from 'object'
    or jsonb_typeof(p_draft->'services') is distinct from 'array'
    or jsonb_typeof(p_draft->'workingDays') is distinct from 'array'
    or jsonb_typeof(p_draft->'travelZones') is distinct from 'array' then
    raise exception 'Invalid registration draft' using errcode = '22023';
  end if;
  select revision into v_revision from public.professional_registration_drafts where professional_id = auth.uid();
  if coalesce(v_revision, 0) <> p_expected_revision then
    raise exception 'Your registration changed on another device. Load the saved version before editing.' using errcode = '40001';
  end if;
  insert into public.professional_registration_drafts(professional_id, draft, revision)
  values(auth.uid(), p_draft, 1)
  on conflict (professional_id) do update set draft = excluded.draft,
    revision = professional_registration_drafts.revision + 1, updated_at = now()
  returning revision into v_revision;
  return v_revision;
end;
$$;
revoke all on function public.save_my_professional_registration_draft(jsonb, integer) from public, anon;
grant execute on function public.save_my_professional_registration_draft(jsonb, integer) to authenticated;

-- Retained/anonymized accounts must not retain their private registration draft.
create or replace function private.clear_completed_professional_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('pending', 'approved', 'suspended') then
    delete from public.professional_registration_drafts where professional_id = new.professional_id;
  end if;
  return new;
end;
$$;
revoke all on function private.clear_completed_professional_draft() from public, anon, authenticated;
create trigger professional_registration_draft_submitted after insert or update of status on public.professional_applications
for each row execute function private.clear_completed_professional_draft();


-- Insert qualifications in the same statement as the application: the older
-- wrapper inserted an empty language_skills array before updating it, violating
-- the database constraint on every new registration.
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
  perform 1 from public.profiles where user_id = p_professional_id and account_role = 'professional' and phone_verified_at is not null for update;
  if not found then
    raise exception 'professional account not found' using errcode = 'P0002';
  end if;

  if private.valid_professional_qualifications(p_payload -> 'profile') is not true
    or coalesce(p_payload #>> '{profile,gender}', '') not in ('female', 'male', 'unspecified') then
    raise exception 'Education, language proficiency and gender are required' using errcode = '22023';
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
    portfolio_count, is_available, approval_status, is_hidden, gender
  ) values (
    p_professional_id,
    trim(p_payload #>> '{profile,displayName}'),
    lower(trim(p_payload #>> '{profile,specialty}')),
    trim(p_payload #>> '{profile,bio}'),
    base_zone_id,
    uploaded_portfolio_count,
    false,
    'pending',
    false,
    p_payload #>> '{profile,gender}'
  ) on conflict (professional_id) do update set
    gender = excluded.gender,
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
    same_day_bookings, terms_accepted_at, status, submitted_at, education_level, language_skills, gender
  ) values (
    p_professional_id,
    p_application_reference,
    trim(p_payload #>> '{profile,legalName}'),
    nullif(trim(p_payload #>> '{profile,email}'), ''),
    p_payload ->> 'preferredLanguage',
    (p_payload #>> '{profile,yearsExperience}')::integer,
    array(select skill ->> 'language' from jsonb_array_elements(p_payload #> '{profile,languageSkills}') skill),
    (p_payload ->> 'sameDayBookings')::boolean,
    p_submitted_at,
    'pending',
    p_submitted_at,
    p_payload #>> '{profile,educationLevel}',
    p_payload #> '{profile,languageSkills}',
    p_payload #>> '{profile,gender}'
  ) on conflict (professional_id) do update set
    education_level = excluded.education_level,
    language_skills = excluded.language_skills,
    gender = excluded.gender,
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
    'professional.application_submitted', 1, 'professional', p_professional_id::text,
    (select coalesce(max(aggregate_version), 0) + 1 from public.domain_event_outbox where aggregate_type = 'professional' and aggregate_id = p_professional_id::text),
    p_submitted_at, p_application_reference,
    jsonb_build_object('professionalId', p_professional_id, 'applicationId', p_application_reference)
  );

  return jsonb_build_object(
    'result', 'submitted',
    'application', private.professional_application_api(p_professional_id)
  );
end;
$$;


grant insert (credential_type) on public.professional_documents to authenticated;
revoke all on function public.submit_professional_application(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.submit_professional_application(uuid, text, jsonb, timestamptz) to service_role;

-- All new bookings must have uploaded evidence, even if an old account already
-- has an onboarding completion timestamp. Existing bookings are unaffected.
create or replace function private.require_client_booking_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.client_has_identity_upload(new.client_id) then
    raise exception 'Upload your passport or both sides of your ID before booking.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.require_client_booking_identity() from public, anon, authenticated;
create trigger booking_client_identity before insert on public.bookings
for each row execute function private.require_client_booking_identity();

commit;

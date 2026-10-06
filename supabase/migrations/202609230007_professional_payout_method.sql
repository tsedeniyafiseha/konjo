begin;

-- ---------------------------------------------------------------------------
-- Professional payout method and manual administrator payouts.
--
-- Client payments land with Konjo, so Konjo owes each professional their net
-- earnings. Professionals now state at registration how they want to be paid
-- (Telebirr, CBE Birr or a bank account). Administrators see who is owed what
-- and where to send it, prepare a payout batch, pay it outside the app, and
-- record the transfer reference against the batch. Every step is audited and
-- the payout method is snapshotted onto the batch so later edits by the
-- professional never change what a past batch says.
-- ---------------------------------------------------------------------------

-- 1. Validation / normalisation (mirrors shared/payout-method.ts).
create or replace function private.payout_method_from_payload(p_method jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_type text := p_method ->> 'type';
  v_name text := trim(coalesce(p_method ->> 'accountName', ''));
  v_number text := regexp_replace(coalesce(p_method ->> 'accountNumber', ''), '[\s()-]', '', 'g');
  v_bank text := trim(coalesce(p_method ->> 'bankName', ''));
  v_mobile text;
begin
  if p_method is null or jsonb_typeof(p_method) <> 'object' then
    raise exception 'payout method is required' using errcode = '22023';
  end if;
  if v_type not in ('telebirr', 'cbe_birr', 'bank') then
    raise exception 'payout method type is not supported' using errcode = '22023';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'payout account name is required' using errcode = '22023';
  end if;
  if v_type = 'bank' then
    if length(v_bank) < 2 or length(v_bank) > 60 or v_number !~ '^\d{6,24}$' then
      raise exception 'bank name and account number are required' using errcode = '22023';
    end if;
    return jsonb_build_object('type', 'bank', 'accountName', v_name, 'accountNumber', v_number, 'bankName', v_bank);
  end if;
  v_mobile := (regexp_match(v_number, '^(?:\+251|251|0)?(9\d{8})$'))[1];
  if v_mobile is null then
    raise exception 'payout mobile number must be an Ethiopian number' using errcode = '22023';
  end if;
  return jsonb_build_object('type', v_type, 'accountName', v_name, 'accountNumber', '+251' || v_mobile);
end;
$$;

create or replace function private.valid_payout_method(p_method jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform private.payout_method_from_payload(p_method);
  return true;
exception when others then
  return false;
end;
$$;

-- 2. Storage. '{}' means "not provided yet" (legacy applications).
alter table public.professional_profiles
  add column if not exists payout_method jsonb not null default '{}'::jsonb;
alter table public.professional_profiles
  drop constraint if exists professional_profiles_payout_method_check;
alter table public.professional_profiles
  add constraint professional_profiles_payout_method_check
  check (payout_method = '{}'::jsonb or private.valid_payout_method(payout_method));

alter table public.payout_batches
  add column if not exists payout_method jsonb not null default '{}'::jsonb;
alter table public.payout_batches add column if not exists paid_reference text;
alter table public.payout_batches add column if not exists paid_note text;
alter table public.payout_batches add column if not exists paid_by uuid references public.profiles (user_id);

-- 3. Registration requires the payout method. Full replacement of the current
--    submit function (202609210002) with the payout method added.
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
  v_payout_method jsonb;
begin
  perform 1 from public.profiles where user_id = p_professional_id and account_role = 'professional' and phone_verified_at is not null for update;
  if not found then
    raise exception 'professional account not found' using errcode = 'P0002';
  end if;

  if private.valid_professional_qualifications(p_payload -> 'profile') is not true
    or coalesce(p_payload #>> '{profile,gender}', '') not in ('female', 'male', 'unspecified') then
    raise exception 'Education, language proficiency and gender are required' using errcode = '22023';
  end if;
  v_payout_method := private.payout_method_from_payload(p_payload #> '{profile,payoutMethod}');

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
    portfolio_count, is_available, approval_status, is_hidden, gender, payout_method
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
    p_payload #>> '{profile,gender}',
    v_payout_method
  ) on conflict (professional_id) do update set
    gender = excluded.gender,
    payout_method = excluded.payout_method,
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

-- 4. The application document (professional app + admin review) carries it.
alter function private.professional_application_api(uuid)
  rename to professional_application_api_without_payout_method;

create function private.professional_application_api(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when base.application is null then null else
    base.application || jsonb_build_object(
      'profile', (base.application -> 'profile') || jsonb_build_object(
        'payoutMethod', nullif(coalesce(profile.payout_method, '{}'::jsonb), '{}'::jsonb)
      )
    )
  end
  from (select private.professional_application_api_without_payout_method(p_professional_id) as application) base
  left join public.professional_profiles profile on profile.professional_id = p_professional_id;
$$;

-- 5. Professionals can change it from their profile; the wrapper validates
--    before delegating, and the inner function is no longer callable directly.
alter function public.update_my_professional_profile(jsonb)
  rename to update_my_professional_profile_without_payout_method;

create function public.update_my_professional_profile(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid := auth.uid();
  v_payout_method jsonb := private.payout_method_from_payload(p_payload #> '{profile,payoutMethod}');
begin
  perform public.update_my_professional_profile_without_payout_method(p_payload);
  update public.professional_profiles
  set payout_method = v_payout_method, updated_at = now()
  where professional_id = v_professional_id;
  return private.professional_application_api(v_professional_id);
end;
$$;

-- 6. Payout documents and batches.
create or replace function private.payout_api(p_payout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', payout.id,
    'professionalId', payout.professional_id,
    'status', payout.status::text,
    'amount', payout.amount,
    'bookingCount', payout.booking_count,
    'createdAt', payout.created_at,
    'paidAt', payout.paid_at,
    'payoutMethod', nullif(payout.payout_method, '{}'::jsonb),
    'paidReference', payout.paid_reference,
    'paidNote', payout.paid_note
  )
  from public.payout_batches payout where payout.id = p_payout_id;
$$;

create or replace function public.queue_professional_payout(
  p_professional_id uuid,
  p_payout_id uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  earning_ids uuid[];
  payout_amount numeric(12, 2);
  payout_count integer;
  claimed_count integer;
  v_payout_method jsonb;
begin
  select array_agg(earning.id), sum(earning.net_amount), count(*)::integer
  into earning_ids, payout_amount, payout_count
  from (
    select id, net_amount from public.professional_earnings
    where professional_id = p_professional_id and payout_id is null
    order by created_at
    for update
  ) earning;
  if payout_count = 0 then return null; end if;

  -- Snapshot where this batch goes, so later edits never rewrite history.
  select coalesce(payout_method, '{}'::jsonb) into v_payout_method
  from public.professional_profiles where professional_id = p_professional_id;

  insert into public.payout_batches (
    id, professional_id, status, amount, booking_count, version, created_at, payout_method
  ) values (
    p_payout_id, p_professional_id, 'queued', payout_amount, payout_count, 1, p_occurred_at, coalesce(v_payout_method, '{}'::jsonb)
  );
  update public.professional_earnings set payout_id = p_payout_id
  where id = any(earning_ids) and payout_id is null;
  get diagnostics claimed_count = row_count;
  if claimed_count <> payout_count then
    raise exception 'professional earnings changed while payout was queued';
  end if;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'PayoutQueued', 1, 'payout', p_payout_id::text, 1,
    p_occurred_at, p_payout_id::text,
    jsonb_build_object(
      'payoutId', p_payout_id, 'professionalId', p_professional_id,
      'amount', payout_amount, 'bookingCount', payout_count
    )
  );
  return private.payout_api(p_payout_id);
end;
$$;

drop function if exists public.settle_professional_payout(uuid, uuid, timestamptz);

create function public.settle_professional_payout(
  p_professional_id uuid,
  p_payout_id uuid,
  p_occurred_at timestamptz,
  p_paid_reference text default null,
  p_paid_note text default null,
  p_paid_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payout public.payout_batches%rowtype;
begin
  select * into payout from public.payout_batches
  where id = p_payout_id and professional_id = p_professional_id
  for update;
  if not found then return null; end if;
  if payout.status = 'paid' then return private.payout_api(p_payout_id); end if;
  if payout.status <> 'queued' then return null; end if;

  update public.payout_batches set
    status = 'paid', paid_at = p_occurred_at, version = version + 1,
    paid_reference = nullif(trim(coalesce(p_paid_reference, '')), ''),
    paid_note = nullif(trim(coalesce(p_paid_note, '')), ''),
    paid_by = p_paid_by
  where id = payout.id and version = payout.version and status = 'queued';
  if not found then return null; end if;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'PayoutPaid', 1, 'payout', payout.id::text, payout.version + 1,
    p_occurred_at, payout.id::text, 'payout:' || payout.id::text || ':settled',
    jsonb_build_object(
      'payoutId', payout.id, 'professionalId', payout.professional_id,
      'amount', payout.amount, 'bookingCount', payout.booking_count,
      'paidReference', nullif(trim(coalesce(p_paid_reference, '')), '')
    )
  );
  return private.payout_api(p_payout_id);
end;
$$;

create or replace function public.list_admin_payouts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.payout_api(payout.id) order by payout.created_at desc, payout.id), '[]'::jsonb)
  from public.payout_batches payout;
$$;

create or replace function public.list_professional_payouts(p_professional_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.payout_api(payout.id) order by payout.created_at desc), '[]'::jsonb)
  from public.payout_batches payout
  where payout.professional_id = p_professional_id;
$$;

-- 7. Who is owed money and where to send it: one row per professional with
--    earnings that are not in a batch yet.
create or replace function public.list_admin_pending_payouts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'professionalId', owed.professional_id,
    'displayName', profile.display_name,
    'amount', owed.amount,
    'bookingCount', owed.booking_count,
    'oldestEarningAt', owed.oldest_earning_at,
    'payoutMethod', nullif(profile.payout_method, '{}'::jsonb)
  ) order by owed.oldest_earning_at, owed.professional_id), '[]'::jsonb)
  from (
    select professional_id, sum(net_amount) as amount, count(*)::integer as booking_count, min(created_at) as oldest_earning_at
    from public.professional_earnings
    where payout_id is null
    group by professional_id
  ) owed
  join public.professional_profiles profile on profile.professional_id = owed.professional_id;
$$;

-- 8. Administrator commands, audited.
create or replace function public.queue_admin_payout(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_professional_id uuid, p_payout_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  result := public.queue_professional_payout(p_professional_id, p_payout_id, p_occurred_at);
  if result is null then return null; end if;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'payout.queued', 'payout', p_payout_id::text,
    jsonb_build_object('professionalId', p_professional_id, 'amount', result -> 'amount', 'bookingCount', result -> 'bookingCount'), p_occurred_at);
  return result;
end;
$$;

create or replace function public.settle_admin_payout(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_professional_id uuid, p_payout_id uuid,
  p_paid_reference text default null, p_paid_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  result := public.settle_professional_payout(p_professional_id, p_payout_id, p_occurred_at, p_paid_reference, p_paid_note, p_admin_id);
  if result is null then return null; end if;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'payout.paid', 'payout', p_payout_id::text,
    jsonb_build_object('professionalId', p_professional_id, 'amount', result -> 'amount',
      'paidReference', nullif(trim(coalesce(p_paid_reference, '')), '')), p_occurred_at);
  return result;
end;
$$;

-- 9. Privileges.
revoke all on function private.payout_method_from_payload(jsonb) from public, anon, authenticated;
revoke all on function private.valid_payout_method(jsonb) from public, anon, authenticated;
revoke all on function public.submit_professional_application(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function private.professional_application_api(uuid) from public, anon, authenticated;
revoke all on function private.professional_application_api_without_payout_method(uuid) from public, anon, authenticated;
revoke all on function public.update_my_professional_profile_without_payout_method(jsonb) from public, anon, authenticated;
revoke all on function public.update_my_professional_profile(jsonb) from public, anon;
revoke all on function private.payout_api(uuid) from public, anon, authenticated;
revoke all on function public.queue_professional_payout(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.settle_professional_payout(uuid, uuid, timestamptz, text, text, uuid) from public, anon, authenticated;
revoke all on function public.list_admin_payouts() from public, anon, authenticated;
revoke all on function public.list_professional_payouts(uuid) from public, anon, authenticated;
revoke all on function public.list_admin_pending_payouts() from public, anon, authenticated;
revoke all on function public.queue_admin_payout(uuid, uuid, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_admin_payout(uuid, uuid, timestamptz, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function private.payout_method_from_payload(jsonb) to service_role;
grant execute on function private.valid_payout_method(jsonb) to service_role;
grant execute on function public.submit_professional_application(uuid, text, jsonb, timestamptz) to service_role;
grant execute on function private.professional_application_api(uuid) to service_role;
grant execute on function private.professional_application_api_without_payout_method(uuid) to service_role;
grant execute on function public.update_my_professional_profile(jsonb) to authenticated;
grant execute on function private.payout_api(uuid) to service_role;
grant execute on function public.queue_professional_payout(uuid, uuid, timestamptz) to service_role;
grant execute on function public.settle_professional_payout(uuid, uuid, timestamptz, text, text, uuid) to service_role;
grant execute on function public.list_admin_payouts() to service_role;
grant execute on function public.list_professional_payouts(uuid) to service_role;
grant execute on function public.list_admin_pending_payouts() to service_role;
grant execute on function public.queue_admin_payout(uuid, uuid, timestamptz, uuid, uuid) to service_role;
grant execute on function public.settle_admin_payout(uuid, uuid, timestamptz, uuid, uuid, text, text) to service_role;

commit;

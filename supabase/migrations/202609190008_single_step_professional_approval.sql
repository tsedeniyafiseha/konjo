begin;

-- Professional onboarding is approved as a whole application:
--   * submission requires National ID front/back, an additional government ID
--     and at least three portfolio photos;
--   * one administrator decision approves (or rejects) the application and
--     every pending document it contains;
--   * approved professionals manage up to five portfolio photos that are
--     published immediately and can be removed at any time.

-- ---------------------------------------------------------------------------
-- Application projection: expose the review note so rejected professionals
-- can see why their application was declined.
-- ---------------------------------------------------------------------------
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
    'reviewNote', case
      when application.status in ('rejected', 'changes_requested') then application.admin_notes
      else null
    end,
    'profile', jsonb_build_object(
      'legalName', application.legal_name,
      'displayName', profile.display_name,
      'email', coalesce(application.contact_email, ''),
      'specialty', profile.specialty,
      'bio', profile.bio,
      'yearsExperience', application.years_experience::text,
      'languages', to_jsonb(application.spoken_languages),
      'baseZone', base_zone.name,
      'portfolioCount', (
        select count(*)::integer from public.professional_documents document
        where document.professional_id = p_professional_id
          and document.kind = 'portfolio' and document.status <> 'rejected'
      )
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

-- The administrator queue carries the submitted evidence so the console can
-- show every ID image and portfolio photo next to the application details.
create or replace function public.list_professional_applications(
  p_status public.professional_application_status default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', application.professional_id,
    'phoneNumber', account.phone_number,
    'application', private.professional_application_api(application.professional_id),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', document.id,
        'kind', document.kind,
        'storagePath', document.storage_path,
        'status', document.status,
        'createdAt', document.created_at
      ) order by document.created_at, document.id)
      from public.professional_documents document
      where document.professional_id = application.professional_id
        and document.status <> 'rejected'
        and document.kind in ('national_id_front', 'national_id_back', 'government_id', 'portfolio', 'certificate')
    ), '[]'::jsonb)
  ) order by application.submitted_at desc), '[]'::jsonb)
  from public.professional_applications application
  join public.profiles account on account.user_id = application.professional_id
  where p_status is null or application.status = p_status;
$$;

-- ---------------------------------------------------------------------------
-- Submission: require the three identity documents (existing trigger) and at
-- least three portfolio photos.
-- ---------------------------------------------------------------------------
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

  select count(*)::integer into uploaded_portfolio_count
  from public.professional_documents
  where professional_id = p_professional_id
    and kind = 'portfolio' and status <> 'rejected';
  if uploaded_portfolio_count < 3 then
    raise exception 'at least three portfolio photos are required' using errcode = '23514';
  end if;

  select id into base_zone_id from public.zones
  where lower(name) = lower(p_payload #>> '{profile,baseZone}') and active;
  if base_zone_id is null then
    raise exception 'base zone is not available' using errcode = '22023';
  end if;

  insert into public.professional_profiles (
    professional_id, display_name, specialty, bio, base_zone_id,
    portfolio_count, is_available, approval_status, is_hidden
  ) values (
    p_professional_id,
    trim(p_payload #>> '{profile,displayName}'),
    lower(trim(p_payload #>> '{profile,specialty}')),
    trim(p_payload #>> '{profile,bio}'),
    base_zone_id,
    0,
    false,
    'pending',
    false
  ) on conflict (professional_id) do update set
    display_name = excluded.display_name,
    specialty = excluded.specialty,
    bio = excluded.bio,
    base_zone_id = excluded.base_zone_id,
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

-- ---------------------------------------------------------------------------
-- Document review guard: individual document decisions still require an
-- administrator session, but the application decision below may approve the
-- application's documents on behalf of the reviewing administrator.
-- ---------------------------------------------------------------------------
create or replace function private.guard_and_audit_professional_document_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_reviewer uuid := nullif(current_setting('konjo.application_reviewer', true), '')::uuid;
  reviewer_id uuid := coalesce((select auth.uid()), application_reviewer);
  normalized_reason text := nullif(trim(coalesce(new.rejection_reason, '')), '');
begin
  if application_reviewer is null and not private.is_admin() then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'only pending documents can be approved or rejected'
      using errcode = '22023';
  end if;

  if new.status = 'rejected' and length(coalesce(normalized_reason, '')) < 10 then
    raise exception 'a rejection reason of at least 10 characters is required'
      using errcode = '22023';
  end if;

  new.rejection_reason := case when new.status = 'rejected' then normalized_reason else null end;
  new.reviewed_at := now();
  new.reviewed_by := reviewer_id;

  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, metadata
  ) values (
    reviewer_id,
    'professional_document.' || new.status::text,
    'professional_document',
    new.id::text,
    jsonb_build_object(
      'professional_id', new.professional_id,
      'kind', new.kind,
      'status', new.status,
      'rejection_reason', new.rejection_reason
    )
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One-button application review.
-- ---------------------------------------------------------------------------
drop function if exists public.review_professional_application(uuid, uuid, text, timestamptz);

create or replace function public.review_professional_application(
  p_admin_id uuid,
  p_professional_id uuid,
  p_action text,
  p_occurred_at timestamptz,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_status public.professional_application_status;
  application_reference text;
  application_language text;
  review_note text := nullif(trim(coalesce(p_reason, '')), '');
  approved_portfolio_count integer;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin'
  ) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'request-changes', 'reject') then
    raise exception 'invalid professional application review action' using errcode = '22023';
  end if;
  if review_note is not null and length(review_note) > 500 then
    raise exception 'the review note must be 500 characters or fewer' using errcode = '22023';
  end if;

  select application.application_reference, application.preferred_language
  into application_reference, application_language
  from public.professional_applications application
  where application.professional_id = p_professional_id and application.status = 'pending'
  for update;
  if application_reference is null then
    return null;
  end if;

  select case p_action
    when 'approve' then 'approved'::public.professional_application_status
    when 'reject' then 'rejected'::public.professional_application_status
    else 'changes_requested'::public.professional_application_status
  end into next_status;

  if next_status = 'approved' then
    perform set_config('konjo.application_reviewer', p_admin_id::text, true);
    update public.professional_documents
    set status = 'approved'
    where professional_id = p_professional_id and status = 'pending';
    perform set_config('konjo.application_reviewer', '', true);

    select count(*)::integer into approved_portfolio_count
    from public.professional_documents
    where professional_id = p_professional_id
      and kind = 'portfolio' and status = 'approved';
    if approved_portfolio_count < 3 then
      raise exception 'at least three portfolio photos are required before approval'
        using errcode = '23514';
    end if;
  end if;

  update public.professional_applications
  set status = next_status,
      reviewed_at = p_occurred_at,
      reviewed_by = p_admin_id,
      admin_notes = case when next_status = 'approved' then null else review_note end,
      updated_at = p_occurred_at
  where professional_id = p_professional_id;

  update public.professional_profiles
  set approval_status = next_status,
      is_hidden = case when next_status = 'approved' then false else is_hidden end,
      is_available = case when next_status = 'approved' then true else false end,
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
    jsonb_build_object(
      'applicationId', application_reference,
      'status', next_status,
      'reason', review_note
    ),
    p_occurred_at
  );

  if next_status in ('approved', 'rejected') then
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      case when next_status = 'approved' then 'ProfessionalApproved' else 'ProfessionalRejected' end,
      1, 'professional', p_professional_id::text, 2,
      p_occurred_at, application_reference,
      jsonb_build_object(
        'professionalId', p_professional_id,
        'applicationId', application_reference,
        'language', application_language
      ) || case when next_status = 'rejected'
        then jsonb_build_object('reason', coalesce(review_note, ''))
        else '{}'::jsonb end
    );
  end if;

  return private.professional_application_api(p_professional_id);
end;
$$;

revoke all on function public.review_professional_application(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.review_professional_application(uuid, uuid, text, timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Portfolio rules: at most five active photos; approved professionals publish
-- instantly. The status is always decided here, never by the client.
-- ---------------------------------------------------------------------------
create or replace function private.prepare_professional_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  professional_status public.professional_application_status;
begin
  perform pg_advisory_xact_lock(hashtext('professional_documents:' || new.professional_id::text));

  select approval_status into professional_status
  from public.professional_profiles
  where professional_id = new.professional_id;

  if new.kind = 'portfolio' then
    if (
      select count(*) from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'portfolio' and status <> 'rejected'
    ) >= 5 then
      raise exception 'you can keep up to five portfolio photos' using errcode = '23514';
    end if;
  end if;

  if new.kind = 'portfolio' and professional_status = 'approved' then
    new.status := 'approved';
    new.reviewed_at := now();
    new.reviewed_by := null;
  else
    new.status := 'pending';
    new.reviewed_at := null;
    new.reviewed_by := null;
  end if;
  new.rejection_reason := null;
  return new;
end;
$$;

drop trigger if exists professional_documents_prepare on public.professional_documents;
create trigger professional_documents_prepare
before insert on public.professional_documents
for each row execute function private.prepare_professional_document();

create or replace function private.sync_professional_portfolio_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_professional uuid := coalesce(new.professional_id, old.professional_id);
begin
  if coalesce(new.kind, old.kind) <> 'portfolio' then
    return null;
  end if;
  update public.professional_profiles
  set portfolio_count = (
        select count(*)::integer from public.professional_documents
        where professional_id = target_professional
          and kind = 'portfolio' and status = 'approved'
      ),
      updated_at = now()
  where professional_id = target_professional;
  return null;
end;
$$;

drop trigger if exists professional_documents_portfolio_count on public.professional_documents;
create trigger professional_documents_portfolio_count
after insert or delete or update of status on public.professional_documents
for each row execute function private.sync_professional_portfolio_count();

revoke all on function private.prepare_professional_document() from public, anon, authenticated;
revoke all on function private.sync_professional_portfolio_count() from public, anon, authenticated;

drop policy if exists professional_documents_owner_insert on public.professional_documents;
create policy professional_documents_owner_insert
on public.professional_documents
for insert
to authenticated
with check (
  professional_id = (select auth.uid())
  and storage_path like ((select auth.uid())::text || '/' || kind::text || '/%')
  and status in ('pending', 'approved')
  and exists (
    select 1 from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.account_role = 'professional'
  )
);

-- Owners may remove anything still pending, and portfolio photos at any time.
drop policy if exists professional_documents_owner_or_admin_delete on public.professional_documents;
create policy professional_documents_owner_or_admin_delete
on public.professional_documents
for delete
to authenticated
using (
  private.is_admin()
  or (
    professional_id = (select auth.uid())
    and (status <> 'approved' or kind = 'portfolio')
  )
);

drop policy if exists professional_documents_storage_delete on storage.objects;
create policy professional_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'professional-documents'
  and (
    private.is_admin()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and not exists (
        select 1 from public.professional_documents document
        where document.storage_path = objects.name
          and document.status = 'approved'
          and document.kind <> 'portfolio'
      )
    )
  )
);

-- ---------------------------------------------------------------------------
-- Approval state is only changed by reviewed server commands. Professionals
-- previously held UPDATE on their own application/profile rows, which allowed
-- self-approval or self-restoring a suspension.
-- ---------------------------------------------------------------------------
drop policy if exists professional_applications_owner_insert on public.professional_applications;
drop policy if exists professional_applications_owner_or_admin_update on public.professional_applications;
create policy professional_applications_admin_update
on public.professional_applications
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists professional_profiles_owner_insert on public.professional_profiles;
drop policy if exists professional_profiles_owner_or_admin_update on public.professional_profiles;
create policy professional_profiles_admin_update
on public.professional_profiles
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

commit;

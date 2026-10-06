begin;

create type public.client_identity_document_kind as enum ('national_id_front', 'national_id_back', 'passport');

alter table public.professional_identity_verifications
  add column verification_method text not null default 'fayda'
  check (verification_method in ('fayda', 'manual_document'));

create or replace function public.record_manual_professional_identity_submission(
  p_professional_id uuid,
  p_last_four text,
  p_submitted_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_last_four !~ '^[0-9]{4}$' then
    raise exception 'invalid identity submission' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where user_id = p_professional_id and account_role = 'professional'
  ) then
    raise exception 'professional account not found' using errcode = 'P0002';
  end if;
  insert into public.professional_identity_verifications (
    professional_id, fayda_last_four, verified_at, verification_method
  ) values (p_professional_id, p_last_four, p_submitted_at, 'manual_document')
  on conflict (professional_id) do update set
    fayda_last_four = excluded.fayda_last_four,
    verified_at = excluded.verified_at,
    verification_method = excluded.verification_method,
    updated_at = now();
end;
$$;

revoke all on function public.record_manual_professional_identity_submission(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_manual_professional_identity_submission(uuid, text, timestamptz)
  to service_role;

create unique index professional_documents_active_manual_identity_kind_idx
  on public.professional_documents (professional_id, kind)
  where kind in ('national_id_front', 'national_id_back')
    and status in ('pending', 'approved');

drop policy if exists professional_documents_storage_insert on storage.objects;
create policy professional_documents_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'professional-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (
      (storage.foldername(name))[2] in (
        'government_id', 'national_id_front', 'national_id_back', 'selfie', 'portfolio'
      )
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
    or (
      (storage.foldername(name))[2] = 'certificate'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'pdf')
    )
  )
  and exists (
    select 1 from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.account_role = 'professional'
  )
);

create or replace function private.enforce_professional_manual_identity_documents()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if not exists (
      select 1 from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'national_id_front' and status <> 'rejected'
    ) or not exists (
      select 1 from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'national_id_back' and status <> 'rejected'
    ) then
      raise exception 'national ID front and back are required' using errcode = '23514';
    end if;
  end if;
  if new.status = 'approved' and old.status is distinct from new.status then
    if not exists (
      select 1 from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'national_id_front' and status = 'approved'
    ) or not exists (
      select 1 from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'national_id_back' and status = 'approved'
    ) then
      raise exception 'approved national ID front and back are required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists professional_applications_manual_identity_documents
  on public.professional_applications;
create trigger professional_applications_manual_identity_documents
before insert or update of status on public.professional_applications
for each row execute function private.enforce_professional_manual_identity_documents();

create table public.client_identity_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.profiles (user_id) on delete cascade,
  kind public.client_identity_document_kind not null,
  storage_path text not null unique,
  status public.professional_document_status not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (user_id),
  created_at timestamptz not null default now(),
  check ((status = 'rejected') = (rejection_reason is not null)),
  check (rejection_reason is null or length(trim(rejection_reason)) between 10 and 500)
);

create unique index client_identity_documents_active_kind_idx
  on public.client_identity_documents (client_id, kind)
  where status in ('pending', 'approved');
create index client_identity_documents_review_queue_idx
  on public.client_identity_documents (status, created_at);

alter table public.client_identity_documents enable row level security;
create policy client_identity_documents_read
on public.client_identity_documents for select to authenticated
using (client_id = (select auth.uid()) or private.is_admin());
create policy client_identity_documents_insert
on public.client_identity_documents for insert to authenticated
with check (
  client_id = (select auth.uid())
  and status = 'pending'
  and storage_path like ((select auth.uid())::text || '/' || kind::text || '/%')
  and exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and account_role = 'client'
  )
);
create policy client_identity_documents_delete
on public.client_identity_documents for delete to authenticated
using (private.is_admin() or (client_id = (select auth.uid()) and status <> 'approved'));

grant select on public.client_identity_documents to authenticated;
grant insert (client_id, kind, storage_path) on public.client_identity_documents to authenticated;
grant delete on public.client_identity_documents to authenticated;
revoke update on public.client_identity_documents from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-identity-documents',
  'client-identity-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy client_identity_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'client-identity-documents'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin())
);
create policy client_identity_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-identity-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] in ('national_id_front', 'national_id_back', 'passport')
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and account_role = 'client'
  )
);
create policy client_identity_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-identity-documents'
  and (
    private.is_admin()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and not exists (
        select 1 from public.client_identity_documents document
        where document.storage_path = name and document.status = 'approved'
      )
    )
  )
);

alter table public.client_identity_verifications alter column fayda_last_four drop not null;
alter table public.client_identity_verifications
  add column verification_method text not null default 'fayda'
  check (verification_method in ('fayda', 'manual_document'));
alter table public.client_identity_verifications
  add constraint client_identity_verifications_method_value_check check (
    (verification_method = 'fayda' and fayda_last_four is not null)
    or verification_method = 'manual_document'
  );

create or replace function public.review_client_identity_document(
  p_document_id uuid,
  p_status public.professional_document_status,
  p_rejection_reason text default null
)
returns public.client_identity_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed public.client_identity_documents;
  reviewer_id uuid := (select auth.uid());
  normalized_reason text := nullif(trim(coalesce(p_rejection_reason, '')), '');
begin
  if not private.is_admin() then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'document decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_status = 'rejected' and length(coalesce(normalized_reason, '')) < 10 then
    raise exception 'a rejection reason of at least 10 characters is required' using errcode = '22023';
  end if;

  update public.client_identity_documents
  set status = p_status,
      rejection_reason = case when p_status = 'rejected' then normalized_reason else null end,
      reviewed_at = now(),
      reviewed_by = reviewer_id
  where id = p_document_id and status = 'pending'
  returning * into reviewed;
  if reviewed.id is null then
    raise exception 'pending client identity document not found' using errcode = 'P0002';
  end if;

  if p_status = 'approved' and (
    exists (
      select 1 from public.client_identity_documents
      where client_id = reviewed.client_id and kind = 'passport' and status = 'approved'
    ) or (
      exists (
        select 1 from public.client_identity_documents
        where client_id = reviewed.client_id and kind = 'national_id_front' and status = 'approved'
      ) and exists (
        select 1 from public.client_identity_documents
        where client_id = reviewed.client_id and kind = 'national_id_back' and status = 'approved'
      )
    )
  ) then
    insert into public.client_identity_verifications (
      client_id, fayda_last_four, verified_at, verification_method
    ) values (reviewed.client_id, null, now(), 'manual_document')
    on conflict (client_id) do update set
      fayda_last_four = null,
      verified_at = excluded.verified_at,
      verification_method = excluded.verification_method;
  end if;

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, metadata)
  values (
    reviewer_id,
    'client_identity_document.' || p_status::text,
    'client_identity_document',
    reviewed.id::text,
    jsonb_build_object('client_id', reviewed.client_id, 'kind', reviewed.kind, 'status', reviewed.status, 'rejection_reason', reviewed.rejection_reason)
  );

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'client.identity_document_' || p_status::text,
    1,
    'client',
    reviewed.client_id::text,
    extract(epoch from now())::bigint,
    now(),
    reviewed.id::text,
    jsonb_build_object('clientId', reviewed.client_id, 'documentId', reviewed.id, 'kind', reviewed.kind)
  );
  return reviewed;
end;
$$;

revoke all on function public.review_client_identity_document(uuid, public.professional_document_status, text)
  from public, anon, authenticated;
grant execute on function public.review_client_identity_document(uuid, public.professional_document_status, text)
  to authenticated;

commit;

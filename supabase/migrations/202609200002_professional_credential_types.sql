begin;

-- Keep education evidence distinct from optional course certificates without
-- changing the storage kind or bucket layout. Legacy certificates are treated
-- as education evidence until a reviewer reclassifies them.
alter table public.professional_documents
  add column if not exists credential_type text;

update public.professional_documents
set credential_type = 'education'
where kind = 'certificate' and credential_type is null;

alter table public.professional_documents
  add constraint professional_documents_credential_type_check
  check (credential_type is null or credential_type in ('education', 'course'));

create or replace function private.require_education_certificate_for_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' and not exists (
    select 1 from public.professional_documents document
    where document.professional_id = new.professional_id
      and document.kind = 'certificate'
      and coalesce(document.credential_type, 'education') = 'education'
      and document.status <> 'rejected'
  ) then
    raise exception 'highest education certificate is required' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists professional_application_education_certificate on public.professional_applications;
create trigger professional_application_education_certificate
before insert or update of status on public.professional_applications
for each row execute function private.require_education_certificate_for_submission();

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
        'credentialType', document.credential_type,
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

commit;

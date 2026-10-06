begin;

create or replace function private.guard_and_audit_professional_document_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_id uuid := (select auth.uid());
  normalized_reason text := nullif(trim(coalesce(new.rejection_reason, '')), '');
begin
  if not private.is_admin() then
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
    admin_id,
    action,
    target_type,
    target_id,
    metadata
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

revoke all on function private.guard_and_audit_professional_document_review()
  from public, anon, authenticated;

drop trigger if exists professional_documents_guard_and_audit_review
  on public.professional_documents;
create trigger professional_documents_guard_and_audit_review
before update of status, rejection_reason, reviewed_at, reviewed_by
on public.professional_documents
for each row execute function private.guard_and_audit_professional_document_review();

create or replace function public.review_professional_document(
  p_document_id uuid,
  p_status public.professional_document_status,
  p_rejection_reason text default null
)
returns public.professional_documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reviewed public.professional_documents;
begin
  if not private.is_admin() then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'document decision must be approved or rejected'
      using errcode = '22023';
  end if;

  update public.professional_documents
  set status = p_status,
      rejection_reason = p_rejection_reason
  where id = p_document_id
    and status = 'pending'
  returning * into reviewed;

  if reviewed.id is null then
    raise exception 'pending professional document not found' using errcode = 'P0002';
  end if;

  return reviewed;
end;
$$;

grant update (status, rejection_reason, reviewed_at, reviewed_by)
  on public.professional_documents to authenticated;
revoke all on function public.review_professional_document(
  uuid,
  public.professional_document_status,
  text
) from public, anon, authenticated;
grant execute on function public.review_professional_document(
  uuid,
  public.professional_document_status,
  text
) to authenticated;

commit;

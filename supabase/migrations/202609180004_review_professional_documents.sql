begin;

-- Document review is a privileged command, not a general table update. The
-- function keeps the status transition and immutable administrator audit in
-- one transaction while deriving the reviewer from the authenticated caller.
create or replace function public.review_professional_document(
  p_document_id uuid,
  p_status public.professional_document_status,
  p_rejection_reason text default null
)
returns public.professional_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed public.professional_documents;
  reviewer_id uuid := (select auth.uid());
  normalized_reason text := nullif(trim(coalesce(p_rejection_reason, '')), '');
begin
  if not private.is_admin() then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'document decision must be approved or rejected'
      using errcode = '22023';
  end if;

  if p_status = 'rejected' and length(coalesce(normalized_reason, '')) < 10 then
    raise exception 'a rejection reason of at least 10 characters is required'
      using errcode = '22023';
  end if;

  update public.professional_documents
  set status = p_status,
      rejection_reason = case when p_status = 'rejected' then normalized_reason else null end,
      reviewed_at = now(),
      reviewed_by = reviewer_id
  where id = p_document_id
    and status = 'pending'
  returning * into reviewed;

  if reviewed.id is null then
    raise exception 'pending professional document not found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    reviewer_id,
    'professional_document.' || p_status::text,
    'professional_document',
    reviewed.id::text,
    jsonb_build_object(
      'professional_id', reviewed.professional_id,
      'kind', reviewed.kind,
      'status', reviewed.status,
      'rejection_reason', reviewed.rejection_reason
    )
  );

  return reviewed;
end;
$$;

revoke update on public.professional_documents from authenticated;
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

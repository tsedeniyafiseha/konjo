begin;

-- Approved verification evidence is immutable to the professional. An
-- administrator can remove it as part of a reviewed correction or deletion
-- workflow, while owners may still remove pending/rejected submissions.
drop policy if exists professional_documents_owner_or_admin_delete
  on public.professional_documents;
create policy professional_documents_owner_or_admin_delete
on public.professional_documents
for delete to authenticated
using (
  private.is_admin()
  or (
    professional_id = (select auth.uid())
    and status <> 'approved'
  )
);

-- Storage deletion also checks the review record so a client cannot bypass
-- the table policy by deleting an approved object directly. Objects without a
-- row remain owner-deletable to support failed-insert compensation.
drop policy if exists professional_documents_storage_delete on storage.objects;
create policy professional_documents_storage_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'professional-documents'
  and (
    private.is_admin()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and not exists (
        select 1
        from public.professional_documents document
        where document.storage_path = name
          and document.status = 'approved'
      )
    )
  )
);

commit;

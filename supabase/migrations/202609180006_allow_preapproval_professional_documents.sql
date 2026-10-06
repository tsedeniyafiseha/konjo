begin;

-- Verification evidence belongs to the authenticated professional account,
-- not to the public profile that is created only after approval.
alter table public.professional_documents
  drop constraint professional_documents_professional_id_fkey;
alter table public.professional_documents
  add constraint professional_documents_professional_id_fkey
  foreign key (professional_id)
  references public.profiles (user_id)
  on delete cascade;

drop policy if exists professional_documents_owner_insert
  on public.professional_documents;
create policy professional_documents_owner_insert
on public.professional_documents
for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/%'
  and status = 'pending'
  and exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.account_role = 'professional'
  )
);

drop policy if exists professional_documents_storage_insert on storage.objects;
create policy professional_documents_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'professional-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.account_role = 'professional'
  )
);

commit;

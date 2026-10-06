begin;

-- Keep file extensions aligned with the semantic document folder. The bucket
-- separately enforces the 10 MB size and global MIME allow-list.
drop policy if exists professional_documents_storage_insert on storage.objects;
create policy professional_documents_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'professional-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (
      (storage.foldername(name))[2] in ('government_id', 'selfie', 'portfolio')
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
    )
    or (
      (storage.foldername(name))[2] = 'certificate'
      and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'pdf')
    )
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.account_role = 'professional'
  )
);

commit;

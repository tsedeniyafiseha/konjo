begin;

-- Identity evidence is a singleton while it is awaiting review or approved.
-- The database invariant closes races between devices and protects the rule
-- from clients that bypass the application controller.
create unique index professional_documents_active_identity_kind_idx
  on public.professional_documents (professional_id, kind)
  where kind in ('government_id', 'selfie')
    and status in ('pending', 'approved');

drop policy if exists professional_documents_owner_insert
  on public.professional_documents;
create policy professional_documents_owner_insert
on public.professional_documents
for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and storage_path like (
    (select auth.uid())::text || '/' || kind::text || '/%'
  )
  and status = 'pending'
  and exists (
    select 1
    from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.account_role = 'professional'
  )
);

commit;

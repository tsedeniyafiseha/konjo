begin;

create or replace function public.list_approved_professional_portfolio_paths(
  p_professional_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', document.id,
    'storagePath', document.storage_path,
    'createdAt', document.created_at
  ) order by document.created_at, document.id), '[]'::jsonb)
  from public.professional_documents document
  where document.professional_id = p_professional_id
    and document.kind = 'portfolio'
    and document.status = 'approved'
    and exists (
      select 1 from public.professional_profiles profile
      where profile.professional_id = document.professional_id
        and profile.approval_status = 'approved'
        and not profile.is_hidden
    );
$$;

revoke all on function public.list_approved_professional_portfolio_paths(uuid)
  from public, anon, authenticated;
grant execute on function public.list_approved_professional_portfolio_paths(uuid)
  to service_role;

commit;

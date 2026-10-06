begin;

-- Home-screen inspiration feed: a shuffled selection of published portfolio
-- photos from approved, visible professionals (at most three per professional
-- so one person cannot fill the feed).
create or replace function public.list_portfolio_feed(p_limit integer default 18)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  with ranked as (
    select
      document.id,
      document.storage_path,
      profile.professional_id,
      profile.display_name,
      profile.specialty,
      profile.is_available,
      row_number() over (partition by profile.professional_id order by random()) as per_professional
    from public.professional_documents document
    join public.professional_profiles profile on profile.professional_id = document.professional_id
    where document.kind = 'portfolio'
      and document.status = 'approved'
      and profile.approval_status = 'approved'
      and not profile.is_hidden
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', picked.id,
    'storagePath', picked.storage_path,
    'professionalId', picked.professional_id,
    'professionalName', picked.display_name,
    'specialty', picked.specialty,
    'available', picked.is_available
  )), '[]'::jsonb)
  from (
    select * from ranked
    where per_professional <= 3
    order by random()
    limit greatest(1, least(coalesce(p_limit, 18), 40))
  ) picked;
$$;

revoke all on function public.list_portfolio_feed(integer) from public, anon, authenticated;
grant execute on function public.list_portfolio_feed(integer) to service_role;

-- Administrators see whether each professional is currently taking bookings.
create or replace function private.admin_professional_api(p_professional_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', professional.professional_id,
    'displayName', professional.display_name,
    'approvalStatus', case when professional.approval_status = 'suspended' then 'suspended' else 'active' end,
    'featured', professional.featured,
    'femaleOnlyEligible', professional.female_only_eligible,
    'hiddenForQuality', professional.is_hidden and professional.approval_status = 'approved',
    'category', professional.specialty,
    'rating', coalesce(professional.average_rating, 0),
    'reviewCount', professional.review_count,
    'available', professional.is_available
  )
  from public.professional_profiles professional
  where professional.professional_id = p_professional_id
    and professional.approval_status in ('approved', 'suspended');
$$;

create or replace function public.list_admin_professionals()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', professional.professional_id,
    'displayName', professional.display_name,
    'approvalStatus', case when professional.approval_status = 'suspended' then 'suspended' else 'active' end,
    'featured', professional.featured,
    'femaleOnlyEligible', professional.female_only_eligible,
    'hiddenForQuality', professional.is_hidden and professional.approval_status = 'approved',
    'category', professional.specialty,
    'rating', coalesce(professional.average_rating, 0),
    'reviewCount', professional.review_count,
    'available', professional.is_available
  ) order by professional.display_name, professional.professional_id), '[]'::jsonb)
  from public.professional_profiles professional
  where professional.approval_status in ('approved', 'suspended');
$$;

commit;

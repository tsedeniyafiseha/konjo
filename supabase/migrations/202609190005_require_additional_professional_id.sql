begin;

-- Professional manual review requires both sides of the National ID plus a
-- second government-issued identity document. All evidence remains in the
-- existing private professional-documents bucket and review queue.
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
    ) or not exists (
      select 1 from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'government_id' and status <> 'rejected'
    ) then
      raise exception 'national ID front and back plus an additional government ID are required'
        using errcode = '23514';
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
    ) or not exists (
      select 1 from public.professional_documents
      where professional_id = new.professional_id
        and kind = 'government_id' and status = 'approved'
    ) then
      raise exception 'approved national ID front and back plus an additional government ID are required'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

commit;

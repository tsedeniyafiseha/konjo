begin;

-- Publish the production domain event name consumed by the backend worker.
-- The worker projects this event into an idempotent approval SMS notification.
create or replace function public.review_professional_application(
  p_admin_id uuid,
  p_professional_id uuid,
  p_action text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_status public.professional_application_status;
  application_reference text;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin'
  ) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'request-changes', 'reject') then
    raise exception 'invalid professional application review action' using errcode = '22023';
  end if;

  select case p_action
    when 'approve' then 'approved'::public.professional_application_status
    when 'reject' then 'rejected'::public.professional_application_status
    else 'changes_requested'::public.professional_application_status
  end into next_status;

  update public.professional_applications
  set status = next_status,
      reviewed_at = p_occurred_at,
      reviewed_by = p_admin_id,
      updated_at = p_occurred_at
  where professional_id = p_professional_id and status = 'pending'
  returning professional_applications.application_reference into application_reference;
  if application_reference is null then
    return null;
  end if;

  update public.professional_profiles
  set approval_status = next_status,
      is_available = case when next_status = 'approved' then is_available else false end,
      portfolio_count = (
        select count(*)::integer from public.professional_documents
        where professional_id = p_professional_id
          and kind = 'portfolio' and status = 'approved'
      ),
      updated_at = p_occurred_at
  where professional_id = p_professional_id;

  insert into public.admin_audit_logs (
    admin_id, action, target_type, target_id, metadata, created_at
  ) values (
    p_admin_id,
    'professional_application.' || replace(p_action, '-', '_'),
    'professional_application',
    p_professional_id::text,
    jsonb_build_object('applicationId', application_reference, 'status', next_status),
    p_occurred_at
  );

  if next_status = 'approved' then
    insert into public.domain_event_outbox (
      event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
      occurred_at, correlation_id, payload
    ) values (
      'ProfessionalApproved', 1, 'professional', p_professional_id::text, 2,
      p_occurred_at, application_reference,
      jsonb_build_object(
        'professionalId', p_professional_id,
        'applicationId', application_reference
      )
    );
  end if;

  return private.professional_application_api(p_professional_id);
end;
$$;

revoke all on function public.review_professional_application(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.review_professional_application(uuid, uuid, text, timestamptz)
  to service_role;

commit;

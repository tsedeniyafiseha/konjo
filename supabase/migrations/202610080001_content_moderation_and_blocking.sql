begin;

-- Account-level blocking and an auditable moderation queue for public profiles
-- and reviews. Only the backend service role can call these functions; every
-- caller identity is still validated inside the transaction.
create table public.professional_blocks (
  client_id uuid not null references public.profiles (user_id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, professional_id),
  check (client_id <> professional_id)
);

create index professional_blocks_client_idx
  on public.professional_blocks (client_id, created_at desc);

create table public.content_reports (
  id uuid primary key,
  reported_by_id uuid not null references public.profiles (user_id) on delete cascade,
  target_type text not null check (target_type in ('professional', 'review')),
  target_id uuid not null,
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  reason text not null check (reason in ('harassment', 'inappropriate_content', 'fraud_or_spam', 'safety_concern', 'other')),
  details text not null default '' check (length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text not null default '' check (length(resolution) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (status = 'open' and resolved_at is null and resolution = '')
    or (status in ('resolved', 'dismissed') and resolved_at is not null and length(trim(resolution)) > 0)
  )
);

create unique index content_reports_one_open_target_idx
  on public.content_reports (reported_by_id, target_type, target_id)
  where status = 'open';
create index content_reports_status_idx
  on public.content_reports (status, created_at desc);

revoke all on table public.professional_blocks from public, anon, authenticated;
revoke all on table public.content_reports from public, anon, authenticated;

create or replace function private.content_report_api(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', report.id,
    'reportedById', report.reported_by_id,
    'targetType', report.target_type,
    'targetId', report.target_id,
    'professionalId', report.professional_id,
    'professionalName', professional.display_name,
    'reason', report.reason,
    'details', report.details,
    'status', report.status,
    'resolution', report.resolution,
    'createdAt', report.created_at,
    'resolvedAt', report.resolved_at
  )
  from public.content_reports report
  join public.professional_profiles professional
    on professional.professional_id = report.professional_id
  where report.id = p_report_id;
$$;

revoke all on function private.content_report_api(uuid) from public, anon, authenticated;
grant execute on function private.content_report_api(uuid) to service_role;

create function public.create_content_report(
  p_report_id uuid,
  p_reported_by_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_details text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professional_id uuid;
  v_existing_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_reported_by_id and account_role = 'client'
  ) then return jsonb_build_object('result', 'not_found'); end if;

  if p_target_type = 'professional' then
    select professional_id into v_professional_id
    from public.professional_profiles where professional_id = p_target_id;
  elsif p_target_type = 'review' then
    select professional_id into v_professional_id
    from public.reviews where id = p_target_id and moderation_status = 'published';
  else
    raise exception 'invalid report target' using errcode = '22023';
  end if;
  if v_professional_id is null then return jsonb_build_object('result', 'not_found'); end if;

  select id into v_existing_id from public.content_reports
  where reported_by_id = p_reported_by_id
    and target_type = p_target_type
    and target_id = p_target_id
    and status = 'open'
  order by created_at desc limit 1;
  if v_existing_id is not null then
    return jsonb_build_object('result', 'existing', 'report', private.content_report_api(v_existing_id));
  end if;

  begin
    insert into public.content_reports (
      id, reported_by_id, target_type, target_id, professional_id,
      reason, details, status, resolution, created_at
    ) values (
      p_report_id, p_reported_by_id, p_target_type, p_target_id, v_professional_id,
      p_reason, trim(coalesce(p_details, '')), 'open', '', p_occurred_at
    );
  exception when unique_violation then
    select id into v_existing_id from public.content_reports
    where reported_by_id = p_reported_by_id
      and target_type = p_target_type
      and target_id = p_target_id
      and status = 'open'
    order by created_at desc limit 1;
    return jsonb_build_object('result', 'existing', 'report', private.content_report_api(v_existing_id));
  end;
  return jsonb_build_object('result', 'created', 'report', private.content_report_api(p_report_id));
end;
$$;

create function public.list_client_blocked_professionals(p_client_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.profiles where user_id = p_client_id and account_role = 'client'
  ) then coalesce(jsonb_agg(block.professional_id order by block.created_at), '[]'::jsonb)
    else '[]'::jsonb end
  from public.professional_blocks block
  where block.client_id = p_client_id;
$$;

create function public.set_client_professional_block(
  p_client_id uuid,
  p_professional_id uuid,
  p_blocked boolean,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where user_id = p_client_id and account_role = 'client'
  ) or not exists (
    select 1 from public.professional_profiles where professional_id = p_professional_id
  ) then return false; end if;
  if p_blocked then
    insert into public.professional_blocks (client_id, professional_id, created_at)
    values (p_client_id, p_professional_id, p_occurred_at)
    on conflict (client_id, professional_id) do nothing;
  else
    delete from public.professional_blocks
    where client_id = p_client_id and professional_id = p_professional_id;
  end if;
  return true;
end;
$$;

create function public.list_admin_content_reports()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.content_report_api(report.id) order by report.created_at desc), '[]'::jsonb)
  from public.content_reports report;
$$;

create function public.resolve_content_report(
  p_audit_id uuid,
  p_admin_id uuid,
  p_report_id uuid,
  p_status text,
  p_action text,
  p_resolution text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare report public.content_reports%rowtype;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin'
  ) then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_status not in ('resolved', 'dismissed') or p_action not in ('none', 'hide_review', 'suspend_professional')
  then raise exception 'invalid moderation resolution' using errcode = '22023'; end if;
  select * into report from public.content_reports where id = p_report_id and status = 'open' for update;
  if not found then return null; end if;
  if p_action = 'hide_review' then
    if report.target_type <> 'review' then raise exception 'only reviews can be hidden' using errcode = '22023'; end if;
    update public.reviews set moderation_status = 'hidden', updated_at = p_occurred_at where id = report.target_id;
    update public.professional_profiles
    set average_rating = (
          select avg((review.technique_rating + review.professionalism_rating) / 2.0)
          from public.reviews review
          where review.professional_id = report.professional_id and review.moderation_status = 'published'
        ),
        review_count = (
          select count(*) from public.reviews review
          where review.professional_id = report.professional_id and review.moderation_status = 'published'
        ),
        updated_at = p_occurred_at
    where professional_id = report.professional_id;
  elsif p_action = 'suspend_professional' then
    update public.professional_profiles
    set approval_status = 'suspended', is_hidden = true, is_available = false, updated_at = p_occurred_at
    where professional_id = report.professional_id;
    update public.professional_applications
    set status = 'suspended', updated_at = p_occurred_at
    where professional_id = report.professional_id;
  end if;
  update public.content_reports
  set status = p_status, resolution = trim(p_resolution), resolved_at = p_occurred_at
  where id = p_report_id;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (
    p_audit_id, p_admin_id, 'content_report.resolved', 'content_report', p_report_id::text,
    jsonb_build_object('status', p_status, 'action', p_action, 'targetType', report.target_type,
      'targetId', report.target_id, 'professionalId', report.professional_id), p_occurred_at
  );
  return private.content_report_api(p_report_id);
end;
$$;

-- Blocking is enforced at quote time, and commit re-quotes immediately before
-- writing a booking. This prevents a stale UI from booking a blocked account.
alter function public.quote_marketplace_booking(jsonb)
  rename to quote_marketplace_booking_without_client_blocks;

create function public.quote_marketplace_booking(p_input jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.professional_blocks
    where client_id = (p_input ->> 'clientId')::uuid
      and professional_id = (p_input ->> 'professionalId')::uuid
  ) then null else public.quote_marketplace_booking_without_client_blocks(p_input) end;
$$;

alter function public.explain_marketplace_booking_quote(jsonb)
  rename to explain_marketplace_booking_quote_without_client_blocks;

create function public.explain_marketplace_booking_quote(p_input jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.professional_blocks
    where client_id = (p_input ->> 'clientId')::uuid
      and professional_id = (p_input ->> 'professionalId')::uuid
  ) then 'professional_unavailable'
    else public.explain_marketplace_booking_quote_without_client_blocks(p_input) end;
$$;

create or replace function public.get_admin_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pendingApplications', (select count(*) from public.professional_applications where status = 'pending'),
    'activeProfessionals', (select count(*) from public.professional_profiles where approval_status = 'approved' and not is_hidden),
    'openBookings', (select count(*) from public.bookings where status not in ('completed', 'cancelled')),
    'openNotificationFailures', (select count(*) from public.notification_outbox where status = 'failed'),
    'queuedPayoutAmount', (select coalesce(sum(amount), 0) from public.payout_batches where status = 'queued'),
    'capturedPaymentAmount', (select coalesce(sum(amount), 0) from public.payment_intents where status = 'captured'),
    'openQualityFlags', (select count(*) from public.professional_quality_flags where status = 'open'),
    'openSafetyIncidents', (select count(*) from public.safety_incidents where status = 'open'),
    'openContentReports', (select count(*) from public.content_reports where status = 'open')
  );
$$;

revoke all on function public.create_content_report(uuid, uuid, text, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.list_client_blocked_professionals(uuid) from public, anon, authenticated;
revoke all on function public.set_client_professional_block(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.list_admin_content_reports() from public, anon, authenticated;
revoke all on function public.resolve_content_report(uuid, uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.quote_marketplace_booking_without_client_blocks(jsonb) from public, anon, authenticated;
revoke all on function public.quote_marketplace_booking(jsonb) from public, anon, authenticated;
revoke all on function public.explain_marketplace_booking_quote_without_client_blocks(jsonb) from public, anon, authenticated;
revoke all on function public.explain_marketplace_booking_quote(jsonb) from public, anon, authenticated;
revoke all on function public.get_admin_summary() from public, anon, authenticated;

grant execute on function public.create_content_report(uuid, uuid, text, uuid, text, text, timestamptz) to service_role;
grant execute on function public.list_client_blocked_professionals(uuid) to service_role;
grant execute on function public.set_client_professional_block(uuid, uuid, boolean, timestamptz) to service_role;
grant execute on function public.list_admin_content_reports() to service_role;
grant execute on function public.resolve_content_report(uuid, uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.quote_marketplace_booking_without_client_blocks(jsonb) to service_role;
grant execute on function public.quote_marketplace_booking(jsonb) to service_role;
grant execute on function public.explain_marketplace_booking_quote_without_client_blocks(jsonb) to service_role;
grant execute on function public.explain_marketplace_booking_quote(jsonb) to service_role;
grant execute on function public.get_admin_summary() to service_role;

commit;

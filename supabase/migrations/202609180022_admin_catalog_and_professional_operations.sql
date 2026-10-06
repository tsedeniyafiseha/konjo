begin;

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
    'reviewCount', professional.review_count
  )
  from public.professional_profiles professional
  where professional.professional_id = p_professional_id
    and professional.approval_status in ('approved', 'suspended');
$$;

revoke all on function private.admin_professional_api(uuid) from public, anon, authenticated;
grant execute on function private.admin_professional_api(uuid) to service_role;

create or replace function public.upsert_admin_service_category(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_id uuid, p_slug text, p_name text, p_active boolean, p_sort_order integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  insert into public.service_categories (id, slug, name, active, sort_order, updated_at)
  values (p_id, lower(trim(p_slug)), trim(p_name), p_active, p_sort_order, p_occurred_at)
  on conflict (id) do update set slug = excluded.slug, name = excluded.name,
    active = excluded.active, sort_order = excluded.sort_order, updated_at = excluded.updated_at;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'service_category.updated', 'service_category', p_id::text,
    jsonb_build_object('slug', lower(trim(p_slug)), 'name', trim(p_name), 'active', p_active, 'sortOrder', p_sort_order), p_occurred_at);
  return jsonb_build_object(
    'id', p_id, 'slug', lower(trim(p_slug)), 'name', trim(p_name),
    'active', p_active, 'sortOrder', p_sort_order, 'updatedAt', p_occurred_at
  );
end;
$$;

create or replace function public.update_admin_commission(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_commission_rate_bps integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_commission_rate_bps < 0 or p_commission_rate_bps > 5000 then raise exception 'invalid commission rate'; end if;
  update public.platform_settings set value_integer = p_commission_rate_bps, updated_at = p_occurred_at
  where key = 'commission_rate_bps';
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'commission_rate.updated', 'platform_setting', 'commission_rate_bps',
    jsonb_build_object('commissionRateBps', p_commission_rate_bps), p_occurred_at);
  return jsonb_build_object(
    'commissionRateBps', p_commission_rate_bps,
    'commissionRatePercent', p_commission_rate_bps / 100.0,
    'updatedAt', p_occurred_at
  );
end;
$$;

create or replace function public.upsert_admin_zone(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_id uuid, p_label text, p_travel_fee numeric, p_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare generated_slug text;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  generated_slug := trim(both '-' from regexp_replace(lower(trim(p_label)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then generated_slug := 'zone-' || left(p_id::text, 8); end if;
  insert into public.zones (id, slug, name, travel_fee, active, updated_at)
  values (p_id, generated_slug, trim(p_label), p_travel_fee, p_active, p_occurred_at)
  on conflict (id) do update set name = excluded.name, travel_fee = excluded.travel_fee,
    active = excluded.active, updated_at = excluded.updated_at;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'zone.updated', 'zone', p_id::text,
    jsonb_build_object('travelFee', p_travel_fee, 'active', p_active), p_occurred_at);
  return jsonb_build_object(
    'id', p_id, 'label', trim(p_label), 'travelFee', p_travel_fee,
    'active', p_active, 'updatedAt', p_occurred_at
  );
end;
$$;

create or replace function public.create_admin_promotion(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_promotion_id uuid, p_code text, p_description text, p_discount_percent integer,
  p_active boolean, p_starts_at timestamptz, p_ends_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare normalized_code text := upper(trim(p_code));
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  insert into public.promotions (
    id, code, description, discount_percent, active, starts_at, ends_at, created_at, updated_at
  ) values (
    p_promotion_id, normalized_code, trim(p_description), p_discount_percent,
    p_active, p_starts_at, p_ends_at, p_occurred_at, p_occurred_at
  );
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'promotion.created', 'promotion', p_promotion_id::text,
    jsonb_build_object('code', normalized_code), p_occurred_at);
  return jsonb_build_object(
    'id', p_promotion_id, 'code', normalized_code, 'description', trim(p_description),
    'discountPercent', p_discount_percent, 'active', p_active,
    'startsAt', p_starts_at, 'endsAt', p_ends_at, 'createdAt', p_occurred_at
  );
end;
$$;

create or replace function public.set_admin_promotion_active(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_promotion_id uuid, p_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare promotion public.promotions%rowtype;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  update public.promotions set active = p_active, updated_at = p_occurred_at
  where id = p_promotion_id returning * into promotion;
  if not found then return null; end if;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'promotion.updated', 'promotion', p_promotion_id::text,
    jsonb_build_object('active', p_active), p_occurred_at);
  return jsonb_build_object(
    'id', promotion.id, 'code', promotion.code, 'description', promotion.description,
    'discountPercent', promotion.discount_percent, 'active', promotion.active,
    'startsAt', promotion.starts_at, 'endsAt', promotion.ends_at,
    'createdAt', promotion.created_at
  );
end;
$$;

create or replace function public.create_admin_broadcast(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_broadcast_id uuid, p_audience text, p_message text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare recipient_count integer;
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_audience not in ('all', 'clients', 'professionals') then raise exception 'invalid broadcast audience'; end if;
  select count(*) into recipient_count from public.profiles profile
  where p_audience = 'all'
    or profile.account_role = case when p_audience = 'clients' then 'client'::public.account_role else 'professional'::public.account_role end;
  insert into public.admin_broadcasts (id, admin_id, audience, message, recipient_count, created_at)
  values (p_broadcast_id, p_admin_id, p_audience, trim(p_message), recipient_count, p_occurred_at);
  insert into public.notification_outbox (
    idempotency_key, user_id, channel, template, payload,
    status, attempts, next_attempt_at, created_at, updated_at
  )
  select 'broadcast:' || p_broadcast_id::text || ':' || profile.user_id::text,
    profile.user_id, 'push', 'admin_broadcast',
    jsonb_build_object('broadcastId', p_broadcast_id, 'message', trim(p_message)),
    'pending', 0, p_occurred_at, p_occurred_at, p_occurred_at
  from public.profiles profile
  where p_audience = 'all'
    or profile.account_role = case when p_audience = 'clients' then 'client'::public.account_role else 'professional'::public.account_role end
  on conflict (idempotency_key) do nothing;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'broadcast.created', 'broadcast', p_broadcast_id::text,
    jsonb_build_object('audience', p_audience, 'recipients', recipient_count), p_occurred_at);
  return jsonb_build_object(
    'id', p_broadcast_id, 'audience', p_audience, 'message', trim(p_message),
    'recipientCount', recipient_count, 'createdAt', p_occurred_at
  );
end;
$$;

create or replace function public.update_admin_professional(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_professional_id uuid, p_featured boolean, p_female_only_eligible boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  update public.professional_profiles set featured = p_featured,
    female_only_eligible = p_female_only_eligible, updated_at = p_occurred_at
  where professional_id = p_professional_id and approval_status in ('approved', 'suspended');
  if not found then return null; end if;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, 'professional.updated', 'professional', p_professional_id::text,
    jsonb_build_object('featured', p_featured, 'femaleOnlyEligible', p_female_only_eligible), p_occurred_at);
  return private.admin_professional_api(p_professional_id);
end;
$$;

create or replace function public.set_admin_professional_state(
  p_audit_id uuid, p_admin_id uuid, p_occurred_at timestamptz,
  p_professional_id uuid, p_action text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare suspended boolean := p_action = 'suspend';
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  if p_action not in ('suspend', 'restore') then raise exception 'invalid professional state action'; end if;
  update public.professional_profiles set
    approval_status = case when suspended then 'suspended'::public.professional_application_status else 'approved'::public.professional_application_status end,
    is_hidden = case when suspended then true else exists (
      select 1 from public.professional_quality_flags flag
      where flag.professional_id = p_professional_id and flag.status = 'open'
    ) end,
    is_available = case when suspended then false else is_available end,
    updated_at = p_occurred_at
  where professional_id = p_professional_id and approval_status in ('approved', 'suspended');
  if not found then return null; end if;
  update public.professional_applications set
    status = case when suspended then 'suspended'::public.professional_application_status else 'approved'::public.professional_application_status end,
    updated_at = p_occurred_at
  where professional_id = p_professional_id;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id,
    case when suspended then 'professional.suspended' else 'professional.restored' end,
    'professional', p_professional_id::text, '{}'::jsonb, p_occurred_at);
  return private.admin_professional_api(p_professional_id);
end;
$$;

create or replace function public.record_admin_audit(
  p_audit_id uuid, p_admin_id uuid, p_action text, p_target_type text,
  p_target_id text, p_metadata jsonb, p_occurred_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where user_id = p_admin_id and account_role = 'admin')
  then raise exception 'administrator role required' using errcode = '42501'; end if;
  insert into public.admin_audit_logs (id, admin_id, action, target_type, target_id, metadata, created_at)
  values (p_audit_id, p_admin_id, p_action, p_target_type, p_target_id, p_metadata, p_occurred_at);
end;
$$;

revoke all on function public.upsert_admin_service_category(uuid, uuid, timestamptz, uuid, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.update_admin_commission(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.upsert_admin_zone(uuid, uuid, timestamptz, uuid, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.create_admin_promotion(uuid, uuid, timestamptz, uuid, text, text, integer, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.set_admin_promotion_active(uuid, uuid, timestamptz, uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_admin_broadcast(uuid, uuid, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function public.update_admin_professional(uuid, uuid, timestamptz, uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.set_admin_professional_state(uuid, uuid, timestamptz, uuid, text) from public, anon, authenticated;
revoke all on function public.record_admin_audit(uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;

grant execute on function public.upsert_admin_service_category(uuid, uuid, timestamptz, uuid, text, text, boolean, integer) to service_role;
grant execute on function public.update_admin_commission(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.upsert_admin_zone(uuid, uuid, timestamptz, uuid, text, numeric, boolean) to service_role;
grant execute on function public.create_admin_promotion(uuid, uuid, timestamptz, uuid, text, text, integer, boolean, timestamptz, timestamptz) to service_role;
grant execute on function public.set_admin_promotion_active(uuid, uuid, timestamptz, uuid, boolean) to service_role;
grant execute on function public.create_admin_broadcast(uuid, uuid, timestamptz, uuid, text, text) to service_role;
grant execute on function public.update_admin_professional(uuid, uuid, timestamptz, uuid, boolean, boolean) to service_role;
grant execute on function public.set_admin_professional_state(uuid, uuid, timestamptz, uuid, text) to service_role;
grant execute on function public.record_admin_audit(uuid, uuid, text, text, text, jsonb, timestamptz) to service_role;

commit;

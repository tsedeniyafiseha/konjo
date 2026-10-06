begin;

create or replace function public.get_admin_summary()
returns jsonb
language sql
stable
security invoker
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
    'openSafetyIncidents', (select count(*) from public.safety_incidents where status = 'open')
  );
$$;

create or replace function public.get_admin_platform_settings()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'commissionRateBps', setting.value_integer,
    'commissionRatePercent', setting.value_integer / 100.0,
    'updatedAt', setting.updated_at
  ) from public.platform_settings setting where setting.key = 'commission_rate_bps';
$$;

create or replace function public.list_admin_professionals()
returns jsonb
language sql
stable
security invoker
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
    'reviewCount', professional.review_count
  ) order by professional.display_name, professional.professional_id), '[]'::jsonb)
  from public.professional_profiles professional
  where professional.approval_status in ('approved', 'suspended');
$$;

create or replace function public.list_admin_bookings(p_filters jsonb, p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item.value order by item.created_at desc), '[]'::jsonb)
  from (
    select private.booking_api(booking.id) || jsonb_build_object(
      'clientName', client.full_name,
      'professionalName', professional.display_name
    ) as value, booking.created_at
    from public.bookings booking
    join public.profiles client on client.user_id = booking.client_id
    join public.professional_profiles professional on professional.professional_id = booking.professional_id
    where (
      nullif(trim(p_filters ->> 'query'), '') is null
      or lower(booking.id::text) like '%' || lower(trim(p_filters ->> 'query')) || '%'
      or lower(client.full_name) like '%' || lower(trim(p_filters ->> 'query')) || '%'
      or lower(professional.display_name) like '%' || lower(trim(p_filters ->> 'query')) || '%'
      or lower(booking.service_name) like '%' || lower(trim(p_filters ->> 'query')) || '%'
    )
      and (nullif(p_filters ->> 'status', '') is null or booking.status::text = p_filters ->> 'status')
      and (nullif(p_filters ->> 'dateFrom', '') is null or
        (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date >= (p_filters ->> 'dateFrom')::date)
      and (nullif(p_filters ->> 'dateTo', '') is null or
        (booking.scheduled_start at time zone 'Africa/Addis_Ababa')::date <= (p_filters ->> 'dateTo')::date)
      and (nullif(p_filters ->> 'professionalId', '') is null or
        booking.professional_id::text = p_filters ->> 'professionalId')
    order by booking.created_at desc
    limit greatest(1, least(p_limit, 10000))
  ) item;
$$;

create or replace function public.list_admin_payouts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', payout.id, 'professionalId', payout.professional_id,
    'status', payout.status, 'amount', payout.amount,
    'bookingCount', payout.booking_count, 'createdAt', payout.created_at,
    'paidAt', payout.paid_at
  ) order by payout.created_at desc, payout.id), '[]'::jsonb)
  from public.payout_batches payout;
$$;

create or replace function public.list_admin_revenue_rows()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'bookingId', booking.id, 'createdAt', booking.created_at,
    'paymentStatus', payment.status, 'grossAmount', payment.amount,
    'refundedAmount', payment.refunded_amount,
    'netCollected', payment.amount - payment.refunded_amount,
    'commissionAmount', coalesce(earning.commission_amount, 0),
    'professionalPayable', coalesce(earning.net_amount, 0)
  ) order by booking.created_at desc, booking.id), '[]'::jsonb)
  from public.bookings booking
  join public.payment_intents payment on payment.booking_id = booking.id
  left join public.professional_earnings earning on earning.booking_id = booking.id;
$$;

create or replace function public.list_admin_audit_logs(p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', audit.id, 'adminId', audit.admin_id, 'action', audit.action,
    'targetType', audit.target_type, 'targetId', audit.target_id,
    'metadata', audit.metadata, 'createdAt', audit.created_at
  ) order by audit.created_at desc, audit.id), '[]'::jsonb)
  from (
    select * from public.admin_audit_logs
    order by created_at desc, id
    limit greatest(1, least(p_limit, 1000))
  ) audit;
$$;

create or replace function public.list_admin_zones()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', zone.id, 'label', zone.name, 'travelFee', zone.travel_fee,
    'active', zone.active, 'updatedAt', zone.updated_at
  ) order by zone.name, zone.id), '[]'::jsonb)
  from public.zones zone;
$$;

create or replace function public.list_admin_disputes()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', dispute.id, 'bookingId', dispute.booking_id, 'clientId', dispute.client_id,
    'reason', dispute.reason, 'status', dispute.status, 'resolution', dispute.resolution,
    'createdAt', dispute.created_at, 'resolvedAt', dispute.resolved_at
  ) order by dispute.created_at desc, dispute.id), '[]'::jsonb)
  from public.booking_disputes dispute;
$$;

create or replace function public.list_admin_quality_flags()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', flag.id, 'professionalId', flag.professional_id,
    'professionalName', professional.display_name, 'bookingId', flag.booking_id,
    'averageRating', flag.average_rating, 'status', flag.status,
    'resolution', flag.resolution, 'createdAt', flag.created_at,
    'resolvedAt', flag.resolved_at
  ) order by flag.created_at desc, flag.id), '[]'::jsonb)
  from public.professional_quality_flags flag
  join public.professional_profiles professional on professional.professional_id = flag.professional_id;
$$;

create or replace function public.list_admin_safety_incidents()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', incident.id, 'bookingId', incident.booking_id,
    'reportedById', incident.reported_by_id, 'reportedByRole', incident.reported_by_role,
    'latitude', incident.latitude, 'longitude', incident.longitude,
    'accuracyMeters', incident.accuracy_meters, 'status', incident.status,
    'resolution', incident.resolution, 'createdAt', incident.created_at,
    'resolvedAt', incident.resolved_at
  ) order by incident.created_at desc, incident.id), '[]'::jsonb)
  from public.safety_incidents incident;
$$;

create or replace function public.list_admin_broadcasts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', broadcast.id, 'audience', broadcast.audience,
    'message', broadcast.message, 'recipientCount', broadcast.recipient_count,
    'createdAt', broadcast.created_at
  ) order by broadcast.created_at desc, broadcast.id), '[]'::jsonb)
  from public.admin_broadcasts broadcast;
$$;

revoke all on function public.get_admin_summary() from public, anon, authenticated;
revoke all on function public.get_admin_platform_settings() from public, anon, authenticated;
revoke all on function public.list_admin_professionals() from public, anon, authenticated;
revoke all on function public.list_admin_bookings(jsonb, integer) from public, anon, authenticated;
revoke all on function public.list_admin_payouts() from public, anon, authenticated;
revoke all on function public.list_admin_revenue_rows() from public, anon, authenticated;
revoke all on function public.list_admin_audit_logs(integer) from public, anon, authenticated;
revoke all on function public.list_admin_zones() from public, anon, authenticated;
revoke all on function public.list_admin_disputes() from public, anon, authenticated;
revoke all on function public.list_admin_quality_flags() from public, anon, authenticated;
revoke all on function public.list_admin_safety_incidents() from public, anon, authenticated;
revoke all on function public.list_admin_broadcasts() from public, anon, authenticated;

grant execute on function public.get_admin_summary() to service_role;
grant execute on function public.get_admin_platform_settings() to service_role;
grant execute on function public.list_admin_professionals() to service_role;
grant execute on function public.list_admin_bookings(jsonb, integer) to service_role;
grant execute on function public.list_admin_payouts() to service_role;
grant execute on function public.list_admin_revenue_rows() to service_role;
grant execute on function public.list_admin_audit_logs(integer) to service_role;
grant execute on function public.list_admin_zones() to service_role;
grant execute on function public.list_admin_disputes() to service_role;
grant execute on function public.list_admin_quality_flags() to service_role;
grant execute on function public.list_admin_safety_incidents() to service_role;
grant execute on function public.list_admin_broadcasts() to service_role;

commit;

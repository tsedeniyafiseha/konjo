begin;
alter table public.notification_outbox add column push_ticket text;
alter table public.notification_outbox add column push_ticket_started_at timestamptz;
alter table public.notification_outbox add column push_destination text;
create or replace function public.claim_due_notification_jobs(
  p_now timestamptz,
  p_limit integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select notification.id from public.notification_outbox notification
    where notification.status = 'pending' and notification.next_attempt_at <= p_now
    order by notification.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.notification_outbox notification
    set next_attempt_at = p_now + interval '5 minutes', updated_at = p_now
    from due where notification.id = due.id
    returning notification.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', claimed.id,
    'pushTicket', claimed.push_ticket,
    'pushTicketStartedAt', claimed.push_ticket_started_at,
    'channel', claimed.channel,
    'template', claimed.template,
    'payload', claimed.payload,
    'destination', coalesce(claimed.push_destination, case when claimed.channel = 'push' then coalesce((
      select device.token from public.device_registrations device
      where device.user_id = claimed.user_id and device.active
      order by device.updated_at desc limit 1
    ), '') else coalesce(profile.phone_number, '') end),
    'language', coalesce(
      profile.preferred_language,
      (select application.preferred_language from public.professional_applications application
        where application.professional_id = claimed.user_id),
      'en'
    ),
    'attempt', claimed.attempts + 1
  ) order by claimed.created_at), '[]'::jsonb)
  from claimed
  join public.profiles profile on profile.user_id = claimed.user_id;
$$;


CREATE OR REPLACE FUNCTION public.record_notification_delivery(p_job jsonb, p_result jsonb, p_recorded_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  delivered boolean := (p_result ->> 'delivered')::boolean;
  v_attempt integer := (p_job ->> 'attempt')::integer;
  terminal boolean;
  next_attempt timestamptz;
begin
  if coalesce((p_result ->> 'pending')::boolean, false) then
    update public.notification_outbox set
      push_ticket = substring(p_result ->> 'providerReference' from 13),
      push_ticket_started_at = coalesce(push_ticket_started_at, p_recorded_at),
      push_destination = p_job ->> 'destination',
      next_attempt_at = p_recorded_at + interval '1 minute', updated_at = p_recorded_at
      where id = (p_job ->> 'id')::uuid and status = 'pending';
    return;
  end if;
  if p_result ->> 'errorMessage' = 'DeviceNotRegistered' then
    update public.device_registrations set active = false where token = p_job ->> 'destination';
  end if;
  insert into public.notification_deliveries (
    outbox_id, attempt, status, provider_reference, error_message, created_at
  ) values (
    (p_job ->> 'id')::uuid, v_attempt,
    case when delivered then 'delivered' else 'failed' end,
    nullif(p_result ->> 'providerReference', ''),
    nullif(left(p_result ->> 'errorMessage', 2000), ''),
    p_recorded_at
  ) on conflict (outbox_id, attempt) do nothing;
  terminal := delivered or v_attempt >= 3;
  next_attempt := p_recorded_at + make_interval(secs => least(60, (2 ^ v_attempt)::integer));
  update public.notification_outbox set
    status = case when delivered then 'delivered' when terminal then 'failed' else 'pending' end,
    attempts = greatest(attempts, v_attempt),
    next_attempt_at = next_attempt,
    updated_at = p_recorded_at
  where id = (p_job ->> 'id')::uuid;
end;
$function$;

commit;

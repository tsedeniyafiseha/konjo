begin;

create or replace function public.record_notification_delivery(
  p_job jsonb,
  p_result jsonb,
  p_recorded_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  delivered boolean := (p_result ->> 'delivered')::boolean;
  v_attempt integer := (p_job ->> 'attempt')::integer;
  terminal boolean;
  next_attempt timestamptz;
begin
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
$$;

revoke all on function public.record_notification_delivery(jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_notification_delivery(jsonb, jsonb, timestamptz)
  to service_role;

commit;

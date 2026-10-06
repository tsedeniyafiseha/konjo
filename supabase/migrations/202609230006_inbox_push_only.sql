begin;

-- ---------------------------------------------------------------------------
-- The in-app inbox lists push records only.
--
-- New booking requests now also send the professional an SMS. Both rows live
-- in notification_outbox, but the inbox must show one entry per event, so SMS
-- rows are left out of the listing.
-- ---------------------------------------------------------------------------
create or replace function public.list_client_notifications(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', notification.id,
    'channel', notification.channel,
    'template', notification.template,
    'status', notification.status,
    'attempts', notification.attempts,
    'payload', notification.payload,
    'readAt', notification.read_at,
    'createdAt', notification.created_at
  ) order by notification.created_at desc), '[]'::jsonb)
  from (
    select * from public.notification_outbox
    where user_id = p_client_id and channel = 'push'
    order by created_at desc limit 50
  ) notification;
$$;

revoke all on function public.list_client_notifications(uuid) from public, anon, authenticated;
grant execute on function public.list_client_notifications(uuid) to service_role;

commit;

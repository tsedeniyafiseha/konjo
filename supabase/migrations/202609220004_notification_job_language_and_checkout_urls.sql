begin;

-- Local sandbox checkout pages are served over plain http; production Chapa
-- links are https. Allow both.
alter table public.payment_intents
  drop constraint if exists payment_intents_checkout_url_check;
alter table public.payment_intents
  add constraint payment_intents_checkout_url_check
  check (checkout_url is null or checkout_url ~ '^https?://');

-- Push and SMS copy is rendered in the recipient's app language. Clients keep
-- it on their profile, professionals on their application.
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
    'channel', claimed.channel,
    'template', claimed.template,
    'payload', claimed.payload,
    'destination', case when claimed.channel = 'push' then coalesce((
      select device.token from public.device_registrations device
      where device.user_id = claimed.user_id and device.active
      order by device.updated_at desc limit 1
    ), '') else coalesce(profile.phone_number, '') end,
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

commit;

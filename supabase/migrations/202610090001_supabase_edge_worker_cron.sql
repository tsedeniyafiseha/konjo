begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_konjo_background_jobs()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_token text;
  request_id bigint;
begin
  select decrypted_secret
  into worker_token
  from vault.decrypted_secrets
  where name = 'konjo_worker_token'
  order by updated_at desc
  limit 1;

  if worker_token is null or length(worker_token) < 32 then
    raise exception 'Konjo worker token is not configured in Vault';
  end if;

  select net.http_post(
    url := 'https://uikwhmkkfidckcejllrk.supabase.co/functions/v1/api/v1/internal/jobs/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-konjo-worker-token', worker_token
    ),
    body := '{}'::jsonb
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_konjo_background_jobs() from public, anon, authenticated;
grant execute on function private.invoke_konjo_background_jobs() to postgres;

do $migration$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'konjo-background-jobs'
  ) then
    perform cron.unschedule('konjo-background-jobs');
  end if;
end
$migration$;

select cron.schedule(
  'konjo-background-jobs',
  '* * * * *',
  'select private.invoke_konjo_background_jobs();'
);

commit;

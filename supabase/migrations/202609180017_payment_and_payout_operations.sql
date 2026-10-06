begin;

create or replace function private.payout_api(p_payout_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', payout.id,
    'professionalId', payout.professional_id,
    'status', payout.status::text,
    'amount', payout.amount,
    'bookingCount', payout.booking_count,
    'createdAt', payout.created_at,
    'paidAt', payout.paid_at
  )
  from public.payout_batches payout where payout.id = p_payout_id;
$$;

create or replace function public.process_provider_payment_event(
  p_event_id text,
  p_provider public.booking_payment_method,
  p_provider_reference text,
  p_status public.payment_status,
  p_payload_hash text,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  duplicate public.payment_events%rowtype;
  payment public.payment_intents%rowtype;
  event_type text;
begin
  select * into duplicate from public.payment_events where event_id = p_event_id;
  if found then
    if duplicate.payload_hash <> p_payload_hash then
      return jsonb_build_object('result', 'invalid_transition');
    end if;
    return jsonb_build_object(
      'result', 'duplicate',
      'paymentIntent', private.payment_intent_api(duplicate.payment_intent_id)
    );
  end if;

  select * into payment from public.payment_intents
  where provider_reference = p_provider_reference and provider = p_provider
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if p_status not in ('authorized', 'captured', 'failed')
    or payment.status in ('refunded', 'cash_due', 'cash_collected')
    or (payment.status = 'failed' and p_status <> 'failed')
    or (payment.status = 'captured' and p_status <> 'captured')
  then return jsonb_build_object('result', 'invalid_transition'); end if;

  insert into public.payment_events (
    event_id, payment_intent_id, event_type, payload_hash, created_at
  ) values (
    p_event_id, payment.id, p_status::text, p_payload_hash, p_occurred_at
  );
  update public.payment_intents set
    status = p_status, version = version + 1, updated_at = p_occurred_at
  where id = payment.id and version = payment.version;
  if not found then return jsonb_build_object('result', 'invalid_transition'); end if;

  if p_status = 'captured' and payment.status <> 'captured' then
    insert into public.ledger_entries (
      booking_id, payment_intent_id, entry_group, account, amount, created_at
    ) values
      (payment.booking_id, payment.id, 'capture:' || payment.id, 'provider_clearing', payment.amount, p_occurred_at),
      (payment.booking_id, payment.id, 'capture:' || payment.id, 'escrow_liability', -payment.amount, p_occurred_at)
    on conflict (entry_group, account) do nothing;
  end if;

  event_type := case p_status
    when 'authorized' then 'PaymentAuthorized'
    when 'captured' then 'PaymentCaptured'
    else 'PaymentFailed' end;
  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    event_type, 1, 'payment', payment.id::text, payment.version + 1,
    p_occurred_at, payment.booking_id::text, p_event_id,
    jsonb_build_object(
      'clientId', payment.client_id,
      'bookingId', payment.booking_id,
      'paymentIntentId', payment.id,
      'provider', payment.provider::text,
      'reason', 'provider_webhook'
    )
  );

  return jsonb_build_object(
    'result', 'updated',
    'paymentIntent', private.payment_intent_api(payment.id)
  );
exception
  when unique_violation then
    select * into duplicate from public.payment_events where event_id = p_event_id;
    if duplicate.payload_hash = p_payload_hash then
      return jsonb_build_object(
        'result', 'duplicate',
        'paymentIntent', private.payment_intent_api(duplicate.payment_intent_id)
      );
    end if;
    return jsonb_build_object('result', 'invalid_transition');
end;
$$;

create or replace function public.queue_professional_payout(
  p_professional_id uuid,
  p_payout_id uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  earning_ids uuid[];
  payout_amount numeric(12, 2);
  payout_count integer;
  claimed_count integer;
begin
  select array_agg(earning.id), sum(earning.net_amount), count(*)::integer
  into earning_ids, payout_amount, payout_count
  from (
    select id, net_amount from public.professional_earnings
    where professional_id = p_professional_id and payout_id is null
    order by created_at
    for update
  ) earning;
  if payout_count = 0 then return null; end if;

  insert into public.payout_batches (
    id, professional_id, status, amount, booking_count, version, created_at
  ) values (
    p_payout_id, p_professional_id, 'queued', payout_amount, payout_count, 1, p_occurred_at
  );
  update public.professional_earnings set payout_id = p_payout_id
  where id = any(earning_ids) and payout_id is null;
  get diagnostics claimed_count = row_count;
  if claimed_count <> payout_count then
    raise exception 'professional earnings changed while payout was queued';
  end if;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'PayoutQueued', 1, 'payout', p_payout_id::text, 1,
    p_occurred_at, p_payout_id::text,
    jsonb_build_object(
      'payoutId', p_payout_id, 'professionalId', p_professional_id,
      'amount', payout_amount, 'bookingCount', payout_count
    )
  );
  return private.payout_api(p_payout_id);
end;
$$;

create or replace function public.settle_professional_payout(
  p_professional_id uuid,
  p_payout_id uuid,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payout public.payout_batches%rowtype;
begin
  select * into payout from public.payout_batches
  where id = p_payout_id and professional_id = p_professional_id
  for update;
  if not found then return null; end if;
  if payout.status = 'paid' then return private.payout_api(p_payout_id); end if;
  if payout.status <> 'queued' then return null; end if;

  update public.payout_batches set
    status = 'paid', paid_at = p_occurred_at, version = version + 1
  where id = payout.id and version = payout.version and status = 'queued';
  if not found then return null; end if;

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, causation_id, payload
  ) values (
    'PayoutPaid', 1, 'payout', payout.id::text, payout.version + 1,
    p_occurred_at, payout.id::text, 'payout:' || payout.id::text || ':settled',
    jsonb_build_object(
      'payoutId', payout.id, 'professionalId', payout.professional_id,
      'amount', payout.amount, 'bookingCount', payout.booking_count
    )
  );
  return private.payout_api(p_payout_id);
end;
$$;

revoke all on function private.payout_api(uuid) from public, anon, authenticated;
revoke all on function public.process_provider_payment_event(text, public.booking_payment_method, text, public.payment_status, text, timestamptz) from public, anon, authenticated;
revoke all on function public.queue_professional_payout(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.settle_professional_payout(uuid, uuid, timestamptz) from public, anon, authenticated;

grant execute on function private.payout_api(uuid) to service_role;
grant execute on function public.process_provider_payment_event(text, public.booking_payment_method, text, public.payment_status, text, timestamptz) to service_role;
grant execute on function public.queue_professional_payout(uuid, uuid, timestamptz) to service_role;
grant execute on function public.settle_professional_payout(uuid, uuid, timestamptz) to service_role;

commit;

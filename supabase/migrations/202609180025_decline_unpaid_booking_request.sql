begin;

create function public.decline_professional_booking_request(
  p_professional_id uuid,
  p_booking_id uuid,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking public.bookings%rowtype;
begin
  select * into booking from public.bookings
  where id = p_booking_id and professional_id = p_professional_id
  for update;
  if not found then return 'not_found'; end if;
  if booking.status = 'cancelled'
    and booking.cancelled_by = 'professional'
    and booking.cancellation_reason = 'professional_declined'
  then return 'updated'; end if;
  if booking.status <> 'requested' then return 'invalid_transition'; end if;
  if exists (
    select 1 from public.payment_intents payment where payment.booking_id = booking.id
  ) then
    raise exception 'an unpaid booking request cannot contain a payment intent'
      using errcode = '23514';
  end if;

  update public.bookings set
    status = 'cancelled',
    cancelled_by = 'professional',
    cancellation_policy = null,
    cancellation_reason = 'professional_declined',
    cancelled_at = p_occurred_at,
    version = version + 1,
    updated_at = p_occurred_at
  where id = booking.id and version = booking.version;
  if not found then return 'invalid_transition'; end if;

  insert into public.booking_status_events (
    booking_id, status, changed_by, note, created_at
  ) values (
    booking.id, 'cancelled', p_professional_id,
    'professional action: decline (no payment taken)', p_occurred_at
  );

  insert into public.domain_event_outbox (
    event_type, schema_version, aggregate_type, aggregate_id, aggregate_version,
    occurred_at, correlation_id, payload
  ) values (
    'BookingDeclined', 1, 'booking', booking.id::text, booking.version + 1,
    p_occurred_at, coalesce(booking.client_request_id, booking.id::text),
    jsonb_build_object(
      'clientId', booking.client_id,
      'professionalId', p_professional_id,
      'paymentTaken', false
    )
  );

  return 'updated';
end;
$$;

revoke all on function public.decline_professional_booking_request(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.decline_professional_booking_request(uuid, uuid, timestamptz)
  to service_role;

commit;

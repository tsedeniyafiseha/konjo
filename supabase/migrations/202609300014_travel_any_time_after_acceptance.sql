begin;

-- Once a booking is accepted the professional may set off whenever they
-- choose: the three-hour "too early" guard from 202609300004 is dropped. The
-- guard lived in the wrapper that was later renamed
-- transition_professional_booking_without_rewards; it now simply delegates.
create or replace function public.transition_professional_booking_without_rewards(
  p_professional_id uuid,
  p_booking_id uuid,
  p_action text,
  p_occurred_at timestamptz,
  p_travel_fee numeric default null
)
returns text
language plpgsql
set search_path = ''
as $$
begin
  return public.transition_professional_booking_without_start_guard(p_professional_id, p_booking_id, p_action, p_occurred_at, p_travel_fee);
end;
$$;
revoke all on function public.transition_professional_booking_without_rewards(uuid, uuid, text, timestamptz, numeric) from public, anon, authenticated;
grant execute on function public.transition_professional_booking_without_rewards(uuid, uuid, text, timestamptz, numeric) to service_role;

commit;

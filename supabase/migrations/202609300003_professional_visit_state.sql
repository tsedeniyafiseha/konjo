begin;

-- ---------------------------------------------------------------------------
-- A professional who is on the way to, or in the middle of, a visit cannot
-- take new booking requests, and clients can see that before they try.
--
-- The marketplace list carries `onVisit`; the booking quote returns null for
-- a busy professional (commit re-quotes, so it refuses too) and the explain
-- function names the reason `professional_busy` so the app can show a
-- specific message. The existing functions are renamed and wrapped, not
-- redefined.
-- ---------------------------------------------------------------------------

create or replace function private.professional_on_visit(p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings booking
    where booking.professional_id = p_professional_id
      and booking.status in ('on_the_way', 'in_progress')
  );
$$;
revoke all on function private.professional_on_visit(uuid) from public, anon, authenticated;
grant execute on function private.professional_on_visit(uuid) to service_role;

alter function public.list_marketplace_professionals(jsonb, date)
  rename to list_marketplace_professionals_without_visit_state;

create function public.list_marketplace_professionals(
  p_filters jsonb,
  p_today date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    professional.value || jsonb_build_object(
      'onVisit', private.professional_on_visit((professional.value ->> 'id')::uuid)
    )
    order by professional.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(
    public.list_marketplace_professionals_without_visit_state(p_filters, p_today)
  ) with ordinality professional(value, ordinality);
$$;

alter function public.quote_marketplace_booking(jsonb)
  rename to quote_marketplace_booking_without_visit_state;

create function public.quote_marketplace_booking(p_input jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.professional_on_visit((p_input ->> 'professionalId')::uuid) then null
    else public.quote_marketplace_booking_without_visit_state(p_input)
  end;
$$;

alter function public.explain_marketplace_booking_quote(jsonb)
  rename to explain_marketplace_booking_quote_without_visit_state;

create function public.explain_marketplace_booking_quote(p_input jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.professional_on_visit((p_input ->> 'professionalId')::uuid) then 'professional_busy'
    else public.explain_marketplace_booking_quote_without_visit_state(p_input)
  end;
$$;

-- Only the public entry points are callable; the inner functions are reached
-- through them by the API's service role.
revoke all on function public.list_marketplace_professionals_without_visit_state(jsonb, date) from public, anon, authenticated;
grant execute on function public.list_marketplace_professionals_without_visit_state(jsonb, date) to service_role;
revoke all on function public.list_marketplace_professionals(jsonb, date) from public, anon, authenticated;
grant execute on function public.list_marketplace_professionals(jsonb, date) to anon, authenticated, service_role;
revoke all on function public.quote_marketplace_booking_without_visit_state(jsonb) from public, anon, authenticated;
grant execute on function public.quote_marketplace_booking_without_visit_state(jsonb) to service_role;
revoke all on function public.quote_marketplace_booking(jsonb) from public, anon, authenticated;
grant execute on function public.quote_marketplace_booking(jsonb) to service_role;
revoke all on function public.explain_marketplace_booking_quote_without_visit_state(jsonb) from public, anon, authenticated;
grant execute on function public.explain_marketplace_booking_quote_without_visit_state(jsonb) to service_role;
revoke all on function public.explain_marketplace_booking_quote(jsonb) from public, anon, authenticated;
grant execute on function public.explain_marketplace_booking_quote(jsonb) to service_role;

commit;

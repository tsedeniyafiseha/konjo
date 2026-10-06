begin;

-- Clients can remove finished bookings from their history. The booking, its
-- payments, earnings and receipt are untouched; only the client's own list
-- stops showing it (professionals, administrators and accounting still see it).

alter table public.bookings add column if not exists client_archived_at timestamptz;

create or replace function public.list_client_bookings(p_client_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.booking_api(booking.id)
    order by booking.created_at desc), '[]'::jsonb)
  from public.bookings booking
  where booking.client_id = p_client_id
    and booking.client_archived_at is null;
$$;

create function public.archive_client_booking(p_client_id uuid, p_booking_id uuid, p_occurred_at timestamptz)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking_status public.booking_status;
begin
  select booking.status into booking_status from public.bookings booking
  where booking.id = p_booking_id and booking.client_id = p_client_id for update;
  if not found then return 'not_found'; end if;
  if booking_status not in ('completed', 'cancelled') then return 'not_allowed'; end if;
  update public.bookings set client_archived_at = coalesce(client_archived_at, p_occurred_at)
  where id = p_booking_id and client_id = p_client_id;
  return 'archived';
end;
$$;

revoke all on function public.list_client_bookings(uuid) from public, anon, authenticated;
revoke all on function public.archive_client_booking(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.list_client_bookings(uuid) to service_role;
grant execute on function public.archive_client_booking(uuid, uuid, timestamptz) to service_role;

commit;

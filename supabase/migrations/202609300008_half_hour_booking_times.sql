begin;

-- Availability (202609300005) and the client calendar offer every half hour,
-- but the scheduled-start parser still accepted only the six launch slots, so
-- any other time failed with "unsupported booking time" at commit.
create or replace function private.booking_scheduled_start(p_date date, p_time text)
returns timestamptz
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  normalized text := upper(trim(p_time));
  parsed_time time;
begin
  if normalized !~ '^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$' then
    raise exception 'unsupported booking time' using errcode = '22023';
  end if;
  parsed_time := to_timestamp(normalized, 'HH12:MI AM')::time;
  return (p_date + parsed_time) at time zone 'Africa/Addis_Ababa';
end;
$$;
revoke all on function private.booking_scheduled_start(date, text) from public, anon, authenticated;

commit;

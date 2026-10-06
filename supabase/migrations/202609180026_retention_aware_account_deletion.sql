begin;

-- Account deletion is durable and event-driven. Database PII is removed in
-- this transaction; private Storage objects are removed by the leased domain
-- event worker through the Storage API so provider failures can be retried.
create or replace function public.delete_konjo_account(
  p_user_id uuid,
  p_role public.account_role,
  p_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role = 'admin' or not exists (
    select 1 from public.profiles
    where user_id = p_user_id and account_role = p_role
  ) then
    return false;
  end if;

  if not exists (
    select 1 from public.bookings
    where client_id = p_user_id or professional_id = p_user_id
  ) then
    delete from auth.users where id = p_user_id;
    if not found then return false; end if;
  else
    -- Directly identifying and delivery data is not required for financial
    -- retention. Notification deliveries cascade from their outbox rows.
    delete from public.notification_outbox where user_id = p_user_id;
    delete from public.client_addresses where client_id = p_user_id;
    delete from public.favorites where client_id = p_user_id;
    delete from public.notification_preferences where client_id = p_user_id;
    delete from public.device_registrations where user_id = p_user_id;
    delete from public.client_identity_verifications where client_id = p_user_id;
    delete from public.professional_identity_verifications where professional_id = p_user_id;

    -- Remove document metadata immediately. The AccountDeleted projector uses
    -- the stable user folder prefix to remove physical objects via Storage API.
    delete from public.professional_documents where professional_id = p_user_id;

    if p_role = 'client' then
      update public.bookings
      set address_label = 'Deleted account address',
          address_detail = 'Removed after account deletion',
          latitude = null,
          longitude = null,
          cancellation_reason = null,
          updated_at = p_occurred_at
      where client_id = p_user_id;

      update public.reviews
      set tags = array[]::text[],
          review_text = '',
          updated_at = p_occurred_at
      where client_id = p_user_id;

      update public.booking_disputes
      set reason = 'Removed after account deletion',
          resolution = case
            when status = 'open' then ''
            else 'Resolved before account deletion'
          end
      where client_id = p_user_id;
    end if;

    update public.safety_incidents
    set latitude = null,
        longitude = null,
        accuracy_meters = null,
        resolution = case
          when status = 'open' then ''
          else 'Resolved before account deletion'
        end
    where reported_by_id = p_user_id;

    update public.professional_profiles
    set display_name = 'Deleted professional',
        bio = '',
        portfolio_count = 0,
        is_available = false,
        featured = false,
        female_only_eligible = false,
        is_hidden = true,
        updated_at = p_occurred_at
    where professional_id = p_user_id;

    update public.professional_applications
    set legal_name = 'Deleted professional',
        contact_email = null,
        fayda_last_four = null,
        admin_notes = null,
        terms_accepted_at = null,
        updated_at = p_occurred_at
    where professional_id = p_user_id;

    update public.professional_services
    set note = '', updated_at = p_occurred_at
    where professional_id = p_user_id;

    update auth.users
    set email = 'deleted+' || replace(id::text, '-', '') || '@deleted.invalid',
        phone = null,
        banned_until = '9999-12-31 23:59:59+00',
        raw_user_meta_data = jsonb_build_object(
          'role', p_role::text,
          'full_name', 'Deleted account'
        ),
        updated_at = p_occurred_at
    where id = p_user_id;

    update public.profiles
    set full_name = 'Deleted account',
        email = null,
        phone_number = null,
        onboarding_completed_at = null,
        updated_at = p_occurred_at
    where user_id = p_user_id;
  end if;

  insert into public.domain_event_outbox (
    event_id, event_type, schema_version, aggregate_type, aggregate_id,
    aggregate_version, occurred_at, correlation_id, causation_id, payload,
    status, attempts, available_at, created_at
  ) values (
    extensions.gen_random_uuid(), 'AccountDeleted', 1, 'account', p_user_id::text,
    1, p_occurred_at, 'account:' || p_user_id::text || ':deletion', null,
    jsonb_build_object('userId', p_user_id, 'role', p_role::text),
    'pending', 0, p_occurred_at, p_occurred_at
  );

  return true;
end;
$$;

revoke all on function public.delete_konjo_account(
  uuid, public.account_role, timestamptz
) from public, anon, authenticated;
grant execute on function public.delete_konjo_account(
  uuid, public.account_role, timestamptz
) to service_role;

commit;

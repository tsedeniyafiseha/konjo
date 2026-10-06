begin;

-- Konjo's initial Supabase schema.
-- Authentication credentials, OTP challenges, sessions, and password resets are
-- intentionally owned by Supabase Auth rather than duplicated in public tables.

create extension if not exists pgcrypto with schema extensions;

create type public.account_role as enum ('client', 'professional', 'admin');
create type public.professional_application_status as enum (
  'draft',
  'pending',
  'approved',
  'changes_requested',
  'rejected',
  'suspended'
);
create type public.professional_document_kind as enum ('government_id', 'selfie', 'portfolio', 'certificate');
create type public.professional_document_status as enum ('pending', 'approved', 'rejected');
create type public.booking_status as enum (
  'requested',
  'accepted',
  'on_the_way',
  'in_progress',
  'completed',
  'cancelled'
);
create type public.booking_payment_method as enum ('telebirr', 'cbe', 'card', 'cash');
create type public.payment_status as enum (
  'pending', 'authorized', 'captured', 'cash_due', 'cash_collected', 'refunded', 'failed'
);
create type public.payout_status as enum ('queued', 'paid', 'failed');
create type public.review_moderation_status as enum ('pending', 'published', 'hidden');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  account_role public.account_role not null default 'client',
  full_name text not null default '',
  email text,
  phone_number text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'am', 'om')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table public.client_identity_verifications (
  client_id uuid primary key references public.profiles (user_id) on delete cascade,
  fayda_last_four text not null check (fayda_last_four ~ '^[0-9]{4}$'),
  verified_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  travel_fee numeric(12, 2) not null default 0 check (travel_fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  key text primary key,
  value_integer integer not null,
  updated_at timestamptz not null default now()
);

create table public.client_addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.profiles (user_id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  zone_id uuid not null references public.zones (id),
  address_detail text not null check (length(trim(address_detail)) between 1 and 500),
  latitude double precision,
  longitude double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create unique index client_addresses_one_default_idx
  on public.client_addresses (client_id)
  where is_default;
create index client_addresses_client_idx on public.client_addresses (client_id);

create table public.notification_preferences (
  client_id uuid primary key references public.profiles (user_id) on delete cascade,
  booking_updates boolean not null default true,
  promotions boolean not null default false,
  chat_messages boolean not null default true,
  sms_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.device_registrations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_registrations_user_idx on public.device_registrations (user_id, active);

create table public.notification_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null unique,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  channel text not null check (channel in ('push', 'sms')),
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_outbox_due_idx on public.notification_outbox (status, next_attempt_at);

create table public.notification_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  attempt integer not null check (attempt > 0),
  status text not null check (status in ('delivered', 'failed')),
  provider_reference text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (outbox_id, attempt)
);

create table public.domain_event_outbox (
  event_id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null,
  schema_version integer not null check (schema_version > 0),
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_version bigint not null check (aggregate_version > 0),
  occurred_at timestamptz not null,
  correlation_id text not null,
  causation_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'processing') = (locked_by is not null and locked_until is not null)),
  check (status <> 'processed' or processed_at is not null)
);

create index domain_event_outbox_due_idx
on public.domain_event_outbox (status, available_at, locked_until);

create table public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_id uuid not null references public.profiles (user_id),
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);

create table public.promotions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique check (code = upper(code) and length(trim(code)) between 2 and 40),
  description text not null check (length(trim(description)) between 1 and 500),
  discount_percent smallint not null check (discount_percent between 1 and 100),
  active boolean not null default true,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index promotions_active_idx on public.promotions (active, starts_at, ends_at);

create table public.admin_broadcasts (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_id uuid not null references public.profiles (user_id),
  audience text not null check (audience in ('all', 'clients', 'professionals')),
  message text not null check (length(trim(message)) between 1 and 1000),
  recipient_count integer not null check (recipient_count >= 0),
  created_at timestamptz not null default now()
);

create index admin_broadcasts_created_idx on public.admin_broadcasts (created_at desc);

-- Public-facing professional data is separate from sensitive application data.
create table public.professional_profiles (
  professional_id uuid primary key references public.profiles (user_id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 80),
  specialty text not null,
  bio text not null default '',
  base_zone_id uuid references public.zones (id),
  portfolio_count integer not null default 0 check (portfolio_count >= 0),
  is_available boolean not null default false,
  featured boolean not null default false,
  female_only_eligible boolean not null default false,
  approval_status public.professional_application_status not null default 'draft',
  is_hidden boolean not null default false,
  average_rating numeric(3, 2) check (average_rating is null or average_rating between 1 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index professional_profiles_discovery_idx
  on public.professional_profiles (approval_status, is_hidden, is_available, featured);
create index professional_profiles_base_zone_idx on public.professional_profiles (base_zone_id);

create table public.professional_applications (
  professional_id uuid primary key references public.professional_profiles (professional_id) on delete cascade,
  legal_name text not null check (length(trim(legal_name)) between 3 and 120),
  contact_email text,
  preferred_language text not null default 'am' check (preferred_language in ('en', 'am', 'om')),
  years_experience integer not null default 0 check (years_experience between 0 and 60),
  spoken_languages text[] not null default array['Amharic']::text[],
  fayda_last_four text check (fayda_last_four is null or fayda_last_four ~ '^[0-9]{4}$'),
  same_day_bookings boolean not null default true,
  terms_accepted_at timestamptz,
  status public.professional_application_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (user_id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_email is null or contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (cardinality(spoken_languages) > 0)
);

create index professional_applications_status_idx on public.professional_applications (status, submitted_at);

create table public.professional_services (
  id uuid primary key default extensions.gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  category_id uuid not null references public.service_categories (id),
  name text not null check (length(trim(name)) between 2 and 120),
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  price numeric(12, 2) not null check (price > 0),
  note text not null default '',
  popular boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index professional_services_professional_idx on public.professional_services (professional_id, active);
create index professional_services_category_idx on public.professional_services (category_id, active);

create table public.professional_working_hours (
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  enabled boolean not null default true,
  starts_at time,
  ends_at time,
  primary key (professional_id, weekday),
  check (
    (enabled and starts_at is not null and ends_at is not null and starts_at < ends_at)
    or (not enabled and starts_at is null and ends_at is null)
  )
);

create table public.professional_travel_zones (
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  zone_id uuid not null references public.zones (id) on delete cascade,
  active boolean not null default true,
  primary key (professional_id, zone_id)
);

create table public.professional_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  kind public.professional_document_kind not null,
  storage_path text not null unique,
  status public.professional_document_status not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path like professional_id::text || '/%')
);

create index professional_documents_professional_idx on public.professional_documents (professional_id, kind);

create table public.bookings (
  id uuid primary key default extensions.gen_random_uuid(),
  client_request_id text not null,
  client_id uuid not null references public.profiles (user_id),
  professional_id uuid not null references public.professional_profiles (professional_id),
  service_id uuid not null references public.professional_services (id),
  service_name text not null,
  scheduled_start timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  address_label text not null,
  address_zone text not null,
  address_detail text not null,
  latitude double precision,
  longitude double precision,
  female_only boolean not null default false,
  payment_method public.booking_payment_method not null,
  service_price numeric(12, 2) not null check (service_price >= 0),
  travel_fee numeric(12, 2) not null check (travel_fee >= 0),
  total numeric(12, 2) generated always as (service_price + travel_fee) stored,
  commission_rate_bps integer not null default 1800 check (commission_rate_bps between 0 and 10000),
  status public.booking_status not null default 'requested',
  cancellation_reason text,
  cancellation_policy text check (cancellation_policy in ('full_refund', 'travel_fee_forfeit', 'client_no_show')),
  cancelled_by public.account_role,
  cancelled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  accept_by timestamptz not null default (now() + interval '15 minutes'),
  assignment_version integer not null default 1 check (assignment_version > 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> professional_id),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  unique (client_id, client_request_id)
);

create index bookings_client_created_idx on public.bookings (client_id, created_at desc);
create index bookings_professional_schedule_idx on public.bookings (professional_id, scheduled_start);
create index bookings_status_idx on public.bookings (status, scheduled_start);
create index bookings_accept_by_idx on public.bookings (status, accept_by);

create table public.booking_disputes (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  client_id uuid not null references public.profiles (user_id),
  reason text not null check (length(trim(reason)) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolution text not null default '' check (length(resolution) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (status = 'open' and resolved_at is null and resolution = '')
    or (status in ('resolved', 'rejected') and resolved_at is not null and length(trim(resolution)) > 0)
  )
);

create index booking_disputes_status_idx on public.booking_disputes (status, created_at desc);

create table public.safety_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  reported_by_id uuid not null references public.profiles (user_id),
  reported_by_role public.account_role not null check (reported_by_role in ('client', 'professional')),
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text not null default '' check (length(resolution) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check (accuracy_meters is null or accuracy_meters >= 0),
  check (
    (status = 'open' and resolved_at is null and resolution = '')
    or (status = 'resolved' and resolved_at is not null and length(trim(resolution)) > 0)
  )
);

create index safety_incidents_status_idx on public.safety_incidents (status, created_at desc);

create table public.booking_assignments (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (professional_id),
  assignment_version integer not null check (assignment_version > 0),
  assigned_at timestamptz not null default now(),
  primary key (booking_id, assignment_version),
  unique (booking_id, professional_id)
);

-- Provider credentials and webhook processing remain server-side. Clients can
-- read their own intent state but cannot write financial state directly.
create table public.payment_intents (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  client_id uuid not null references public.profiles (user_id),
  provider public.booking_payment_method not null,
  provider_reference text not null unique,
  status public.payment_status not null,
  amount numeric(12, 2) not null check (amount >= 0),
  refunded_amount numeric(12, 2) not null default 0 check (refunded_amount >= 0 and refunded_amount <= amount),
  version bigint not null default 1 check (version > 0),
  currency text not null default 'ETB' check (currency = 'ETB'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_intents_client_idx on public.payment_intents (client_id, created_at desc);

create table public.payment_events (
  event_id text primary key,
  payment_intent_id uuid not null references public.payment_intents (id) on delete cascade,
  event_type text not null,
  payload_hash text not null check (length(payload_hash) = 64),
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  payment_intent_id uuid not null references public.payment_intents (id) on delete cascade,
  entry_group text not null,
  account text not null check (account in (
    'provider_clearing', 'escrow_liability', 'professional_payable', 'platform_commission'
  )),
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (entry_group, account)
);

create index ledger_entries_booking_idx on public.ledger_entries (booking_id, created_at);

create table public.booking_status_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  status public.booking_status not null,
  changed_by uuid references public.profiles (user_id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index booking_status_events_booking_idx on public.booking_status_events (booking_id, created_at);

create table public.payout_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (professional_id),
  status public.payout_status not null default 'queued',
  amount numeric(12, 2) not null check (amount >= 0),
  booking_count integer not null check (booking_count > 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  check ((status = 'paid') = (paid_at is not null))
);

create index payout_batches_professional_idx on public.payout_batches (professional_id, created_at desc);

create table public.professional_earnings (
  id uuid primary key default extensions.gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (professional_id),
  booking_id uuid not null unique references public.bookings (id),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  commission_amount numeric(12, 2) not null check (commission_amount >= 0),
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  payout_id uuid references public.payout_batches (id),
  created_at timestamptz not null default now(),
  check (net_amount = gross_amount - commission_amount)
);

create index professional_earnings_professional_idx
  on public.professional_earnings (professional_id, created_at desc);

create table public.favorites (
  client_id uuid not null references public.profiles (user_id) on delete cascade,
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, professional_id),
  check (client_id <> professional_id)
);

create table public.reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  client_id uuid not null references public.profiles (user_id),
  professional_id uuid not null references public.professional_profiles (professional_id),
  technique_rating smallint not null check (technique_rating between 1 and 5),
  professionalism_rating smallint not null check (professionalism_rating between 1 and 5),
  tags text[] not null default array[]::text[] check (cardinality(tags) <= 5),
  review_text text not null default '' check (length(review_text) <= 2000),
  moderation_status public.review_moderation_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> professional_id)
);

create index reviews_professional_idx on public.reviews (professional_id, moderation_status, created_at desc);

create table public.professional_quality_flags (
  id uuid primary key default extensions.gen_random_uuid(),
  professional_id uuid not null references public.professional_profiles (professional_id) on delete cascade,
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  average_rating numeric(3, 2) not null check (average_rating between 1 and 5),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text not null default '' check (length(resolution) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (status = 'open' and resolved_at is null and resolution = '')
    or (status = 'resolved' and resolved_at is not null and length(trim(resolution)) > 0)
  )
);

create index professional_quality_flags_status_idx
  on public.professional_quality_flags (status, created_at desc);

create or replace function public.flag_low_professional_rating()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_average numeric(3, 2);
begin
  select avg((technique_rating + professionalism_rating) / 2.0)
  into profile_average
  from public.reviews
  where professional_id = new.professional_id
    and moderation_status = 'published';

  if profile_average < 3 then
    update public.professional_profiles
    set is_hidden = true,
        updated_at = now()
    where professional_id = new.professional_id;

    insert into public.professional_quality_flags (
      professional_id, booking_id, average_rating
    ) values (
      new.professional_id, new.booking_id, profile_average
    ) on conflict (booking_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and account_role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'client');
begin
  insert into public.profiles (user_id, account_role, full_name, email, phone_number)
  values (
    new.id,
    case when requested_role = 'professional' then 'professional'::public.account_role else 'client'::public.account_role end,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.phone
  )
  on conflict (user_id) do update
  set email = excluded.email,
      phone_number = excluded.phone_number,
      updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger zones_set_updated_at before update on public.zones
for each row execute function public.set_updated_at();
create trigger service_categories_set_updated_at before update on public.service_categories
for each row execute function public.set_updated_at();
create trigger platform_settings_set_updated_at before update on public.platform_settings
for each row execute function public.set_updated_at();
create trigger client_addresses_set_updated_at before update on public.client_addresses
for each row execute function public.set_updated_at();
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
for each row execute function public.set_updated_at();
create trigger device_registrations_set_updated_at before update on public.device_registrations
for each row execute function public.set_updated_at();
create trigger notification_outbox_set_updated_at before update on public.notification_outbox
for each row execute function public.set_updated_at();
create trigger promotions_set_updated_at before update on public.promotions
for each row execute function public.set_updated_at();
create trigger professional_profiles_set_updated_at before update on public.professional_profiles
for each row execute function public.set_updated_at();
create trigger professional_applications_set_updated_at before update on public.professional_applications
for each row execute function public.set_updated_at();
create trigger professional_services_set_updated_at before update on public.professional_services
for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function public.set_updated_at();
create trigger payment_intents_set_updated_at before update on public.payment_intents
for each row execute function public.set_updated_at();
create trigger reviews_set_updated_at before update on public.reviews
for each row execute function public.set_updated_at();
create trigger reviews_flag_low_professional_rating
after insert or update of technique_rating, professionalism_rating, moderation_status on public.reviews
for each row execute function public.flag_low_professional_rating();

create trigger on_auth_user_created
after insert or update of email, phone on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill projects that already contain Auth users before this migration.
insert into public.profiles (user_id, account_role, full_name, email, phone_number)
select
  id,
  case
    when raw_user_meta_data ->> 'role' = 'professional' then 'professional'::public.account_role
    else 'client'::public.account_role
  end,
  coalesce(raw_user_meta_data ->> 'full_name', ''),
  email,
  phone
from auth.users
on conflict (user_id) do nothing;

insert into public.zones (id, slug, name, travel_fee) values
  ('10000000-0000-4000-8000-000000000001', 'bole', 'Bole', 120),
  ('10000000-0000-4000-8000-000000000002', 'cmc', 'CMC', 180),
  ('10000000-0000-4000-8000-000000000003', 'kazanchis', 'Kazanchis', 140),
  ('10000000-0000-4000-8000-000000000004', 'old-airport', 'Old Airport', 160),
  ('10000000-0000-4000-8000-000000000005', 'ayat', 'Ayat', 220),
  ('10000000-0000-4000-8000-000000000006', 'megenagna', 'Megenagna', 160),
  ('10000000-0000-4000-8000-000000000007', 'summit', 'Summit', 220),
  ('10000000-0000-4000-8000-000000000008', 'sarbet', 'Sarbet', 170);

insert into public.service_categories (id, slug, name, sort_order) values
  ('20000000-0000-4000-8000-000000000001', 'hair', 'Hair styling', 10),
  ('20000000-0000-4000-8000-000000000002', 'braids', 'Braids & natural hair', 20),
  ('20000000-0000-4000-8000-000000000003', 'nails', 'Nail care', 30),
  ('20000000-0000-4000-8000-000000000004', 'makeup', 'Makeup artistry', 40),
  ('20000000-0000-4000-8000-000000000005', 'barber', 'Barbering', 50),
  ('20000000-0000-4000-8000-000000000006', 'massage', 'Massage & wellness', 60);

insert into public.platform_settings (key, value_integer) values ('commission_rate_bps', 1800);

alter table public.profiles enable row level security;
alter table public.client_identity_verifications enable row level security;
alter table public.zones enable row level security;
alter table public.service_categories enable row level security;
alter table public.platform_settings enable row level security;
alter table public.client_addresses enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.device_registrations enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.domain_event_outbox enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.promotions enable row level security;
alter table public.admin_broadcasts enable row level security;
alter table public.professional_profiles enable row level security;
alter table public.professional_applications enable row level security;
alter table public.professional_services enable row level security;
alter table public.professional_working_hours enable row level security;
alter table public.professional_travel_zones enable row level security;
alter table public.professional_documents enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_disputes enable row level security;
alter table public.safety_incidents enable row level security;
alter table public.booking_assignments enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_events enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.booking_status_events enable row level security;
alter table public.payout_batches enable row level security;
alter table public.professional_earnings enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.professional_quality_flags enable row level security;

create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy profiles_update_self_or_admin on public.profiles
for update to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());
create policy client_identity_verifications_owner_or_admin_read on public.client_identity_verifications
for select to authenticated
using (client_id = (select auth.uid()) or public.is_admin());

create policy zones_public_read on public.zones
for select to anon, authenticated using (active or public.is_admin());
create policy zones_admin_write on public.zones
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_public_read on public.service_categories
for select to anon, authenticated using (active or public.is_admin());
create policy categories_admin_write on public.service_categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy platform_settings_admin_manage on public.platform_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy addresses_owner_or_admin on public.client_addresses
for all to authenticated
using (client_id = (select auth.uid()) or public.is_admin())
with check (client_id = (select auth.uid()) or public.is_admin());
create policy notification_preferences_owner_or_admin on public.notification_preferences
for all to authenticated
using (client_id = (select auth.uid()) or public.is_admin())
with check (client_id = (select auth.uid()) or public.is_admin());
create policy device_registrations_owner_or_admin on public.device_registrations
for all to authenticated
using (user_id = (select auth.uid()) or public.is_admin())
with check (user_id = (select auth.uid()) or public.is_admin());
create policy notification_outbox_owner_or_admin_read on public.notification_outbox
for select to authenticated
using (user_id = (select auth.uid()) or public.is_admin());
create policy notification_deliveries_owner_or_admin_read on public.notification_deliveries
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.notification_outbox outbox
    where outbox.id = notification_deliveries.outbox_id
      and outbox.user_id = (select auth.uid())
  )
);
create policy admin_audit_logs_admin_read on public.admin_audit_logs
for select to authenticated using (public.is_admin());
create policy promotions_public_read on public.promotions
for select to anon, authenticated
using ((active and now() between starts_at and ends_at) or public.is_admin());
create policy promotions_admin_write on public.promotions
for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_broadcasts_admin_manage on public.admin_broadcasts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy professional_profiles_public_read on public.professional_profiles
for select to anon, authenticated
using (
  (approval_status = 'approved' and not is_hidden)
  or professional_id = (select auth.uid())
  or public.is_admin()
);
create policy professional_profiles_owner_insert on public.professional_profiles
for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and approval_status = 'draft'
  and not is_hidden
  and exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.account_role = 'professional'
  )
);
create policy professional_profiles_owner_or_admin_update on public.professional_profiles
for update to authenticated
using (professional_id = (select auth.uid()) or public.is_admin())
with check (professional_id = (select auth.uid()) or public.is_admin());

create policy professional_applications_owner_or_admin_read on public.professional_applications
for select to authenticated
using (professional_id = (select auth.uid()) or public.is_admin());
create policy professional_applications_owner_insert on public.professional_applications
for insert to authenticated
with check (professional_id = (select auth.uid()) and status = 'draft');
create policy professional_applications_owner_or_admin_update on public.professional_applications
for update to authenticated
using (professional_id = (select auth.uid()) or public.is_admin())
with check (professional_id = (select auth.uid()) or public.is_admin());

create policy professional_services_public_read on public.professional_services
for select to anon, authenticated
using (
  professional_id = (select auth.uid())
  or public.is_admin()
  or (
    active and exists (
      select 1 from public.professional_profiles p
      where p.professional_id = professional_services.professional_id
        and p.approval_status = 'approved'
        and not p.is_hidden
    )
  )
);
create policy professional_services_owner_or_admin_write on public.professional_services
for all to authenticated
using (professional_id = (select auth.uid()) or public.is_admin())
with check (professional_id = (select auth.uid()) or public.is_admin());

create policy working_hours_public_read on public.professional_working_hours
for select to anon, authenticated
using (
  professional_id = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.professional_profiles p
    where p.professional_id = professional_working_hours.professional_id
      and p.approval_status = 'approved'
      and not p.is_hidden
  )
);
create policy working_hours_owner_or_admin_write on public.professional_working_hours
for all to authenticated
using (professional_id = (select auth.uid()) or public.is_admin())
with check (professional_id = (select auth.uid()) or public.is_admin());

create policy travel_zones_public_read on public.professional_travel_zones
for select to anon, authenticated
using (
  professional_id = (select auth.uid())
  or public.is_admin()
  or exists (
    select 1 from public.professional_profiles p
    where p.professional_id = professional_travel_zones.professional_id
      and p.approval_status = 'approved'
      and not p.is_hidden
  )
);
create policy travel_zones_owner_or_admin_write on public.professional_travel_zones
for all to authenticated
using (professional_id = (select auth.uid()) or public.is_admin())
with check (professional_id = (select auth.uid()) or public.is_admin());

create policy professional_documents_owner_or_admin_read on public.professional_documents
for select to authenticated
using (professional_id = (select auth.uid()) or public.is_admin());
create policy professional_documents_owner_insert on public.professional_documents
for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/%'
  and status = 'pending'
);
create policy professional_documents_admin_update on public.professional_documents
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy professional_documents_owner_or_admin_delete on public.professional_documents
for delete to authenticated
using (professional_id = (select auth.uid()) or public.is_admin());

create policy bookings_participant_or_admin_read on public.bookings
for select to authenticated
using (
  client_id = (select auth.uid())
  or professional_id = (select auth.uid())
  or public.is_admin()
);
create policy booking_disputes_participant_or_admin_read on public.booking_disputes
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.bookings b
    where b.id = booking_disputes.booking_id
      and ((select auth.uid()) = b.client_id or (select auth.uid()) = b.professional_id)
  )
);
create policy booking_disputes_client_insert on public.booking_disputes
for insert to authenticated
with check (
  client_id = (select auth.uid())
  and status = 'open'
  and resolution = ''
  and resolved_at is null
  and exists (
    select 1 from public.bookings b
    where b.id = booking_disputes.booking_id
      and b.client_id = (select auth.uid())
  )
);
create policy booking_disputes_admin_update on public.booking_disputes
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy safety_incidents_participant_or_admin_read on public.safety_incidents
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.bookings b
    where b.id = safety_incidents.booking_id
      and ((select auth.uid()) = b.client_id or (select auth.uid()) = b.professional_id)
  )
);
create policy safety_incidents_participant_insert on public.safety_incidents
for insert to authenticated
with check (
  reported_by_id = (select auth.uid())
  and reported_by_role in ('client', 'professional')
  and status = 'open'
  and resolution = ''
  and resolved_at is null
  and exists (
    select 1 from public.bookings b
    where b.id = safety_incidents.booking_id
      and b.status in ('accepted', 'on_the_way', 'in_progress')
      and (
        (reported_by_role = 'client' and b.client_id = (select auth.uid()))
        or (reported_by_role = 'professional' and b.professional_id = (select auth.uid()))
      )
  )
);
create policy safety_incidents_admin_update on public.safety_incidents
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy booking_events_participant_or_admin_read on public.booking_status_events
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.bookings b
    where b.id = booking_status_events.booking_id
      and ((select auth.uid()) = b.client_id or (select auth.uid()) = b.professional_id)
  )
);
create policy booking_assignments_participant_or_admin_read on public.booking_assignments
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.bookings b
    where b.id = booking_assignments.booking_id
      and ((select auth.uid()) = b.client_id or (select auth.uid()) = b.professional_id)
  )
);
create policy payment_intents_client_or_admin_read on public.payment_intents
for select to authenticated
using (client_id = (select auth.uid()) or public.is_admin());
create policy payment_events_admin_read on public.payment_events
for select to authenticated using (public.is_admin());
create policy ledger_entries_admin_read on public.ledger_entries
for select to authenticated using (public.is_admin());
create policy payout_batches_owner_or_admin_read on public.payout_batches
for select to authenticated
using (professional_id = (select auth.uid()) or public.is_admin());
create policy professional_earnings_owner_or_admin_read on public.professional_earnings
for select to authenticated
using (professional_id = (select auth.uid()) or public.is_admin());

create policy favorites_owner_or_admin on public.favorites
for all to authenticated
using (client_id = (select auth.uid()) or public.is_admin())
with check (client_id = (select auth.uid()) or public.is_admin());

create policy reviews_public_read on public.reviews
for select to anon, authenticated
using (
  moderation_status = 'published'
  or client_id = (select auth.uid())
  or professional_id = (select auth.uid())
  or public.is_admin()
);
create policy reviews_client_insert on public.reviews
for insert to authenticated
with check (
  client_id = (select auth.uid())
  and moderation_status = 'published'
  and exists (
    select 1 from public.bookings b
    where b.id = reviews.booking_id
      and b.client_id = (select auth.uid())
      and b.professional_id = reviews.professional_id
      and b.status = 'completed'
  )
);
create policy reviews_admin_update on public.reviews
for update to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy professional_quality_flags_admin_manage on public.professional_quality_flags
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.zones, public.service_categories, public.promotions to anon, authenticated;
grant select on public.professional_profiles, public.professional_services,
  public.professional_working_hours, public.professional_travel_zones, public.reviews to anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.client_identity_verifications to authenticated;
grant update (full_name, preferred_language, onboarding_completed_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.client_addresses, public.notification_preferences to authenticated;
grant select, insert, update, delete on public.device_registrations to authenticated;
grant select on public.notification_outbox, public.notification_deliveries to authenticated;
grant select on public.admin_audit_logs to authenticated;
grant select, insert on public.admin_broadcasts to authenticated;
grant insert, update, delete on public.promotions to authenticated;
grant insert (professional_id, display_name, specialty, bio, base_zone_id, portfolio_count, is_available)
  on public.professional_profiles to authenticated;
grant update (display_name, specialty, bio, base_zone_id, portfolio_count, is_available)
  on public.professional_profiles to authenticated;
grant insert (professional_id, legal_name, contact_email, preferred_language, years_experience,
  spoken_languages, same_day_bookings, terms_accepted_at, submitted_at)
  on public.professional_applications to authenticated;
grant update (legal_name, contact_email, preferred_language, years_experience, spoken_languages,
  same_day_bookings, terms_accepted_at, submitted_at)
  on public.professional_applications to authenticated;
grant select on public.professional_applications, public.professional_documents,
  public.bookings, public.booking_assignments, public.booking_status_events, public.payment_intents,
  public.payment_events, public.ledger_entries, public.payout_batches,
  public.professional_earnings to authenticated;
grant select, insert, update on public.booking_disputes to authenticated;
grant select, insert, update on public.safety_incidents to authenticated;
grant insert (professional_id, kind, storage_path) on public.professional_documents to authenticated;
grant delete on public.professional_documents to authenticated;
grant insert, update, delete on public.professional_services,
  public.professional_working_hours, public.professional_travel_zones to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant insert (booking_id, client_id, professional_id, technique_rating, professionalism_rating, tags, review_text)
  on public.reviews to authenticated;
grant select, update on public.professional_quality_flags to authenticated;

grant update, insert, delete on public.zones, public.service_categories to authenticated;
grant select, update on public.platform_settings to authenticated;

grant execute on function public.is_admin() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'professional-documents',
  'professional-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy professional_documents_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'professional-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.professional_profiles p
    where p.professional_id = (select auth.uid())
  )
);
create policy professional_documents_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'professional-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);
create policy professional_documents_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'professional-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_admin()
  )
);

commit;

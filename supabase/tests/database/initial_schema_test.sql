begin;

select plan(169);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'client_identity_verifications', 'client identity verifications table exists');
select has_table('public', 'zones', 'zones table exists');
select has_table('public', 'service_categories', 'service categories table exists');
select has_table('public', 'platform_settings', 'platform settings table exists');
select has_table('public', 'client_addresses', 'client addresses table exists');
select has_table('public', 'device_registrations', 'device registrations table exists');
select has_table('public', 'notification_outbox', 'notification outbox table exists');
select has_table('public', 'notification_deliveries', 'notification deliveries table exists');
select has_table('public', 'domain_event_outbox', 'domain event outbox table exists');
select has_table('public', 'admin_audit_logs', 'admin audit logs table exists');
select has_table('public', 'promotions', 'promotions table exists');
select has_table('public', 'admin_broadcasts', 'admin broadcasts table exists');
select has_table('public', 'professional_profiles', 'professional profiles table exists');
select has_column('public', 'professional_profiles', 'featured', 'professional profiles support featured discovery');
select has_column('public', 'professional_profiles', 'female_only_eligible', 'female-only bookings require administrator-verified eligibility');
select has_table('public', 'professional_applications', 'professional applications table exists');
select has_table('public', 'professional_identity_verifications', 'professional identity verifications table exists');
select has_table('public', 'professional_services', 'professional services table exists');
select has_table('public', 'professional_working_hours', 'professional working hours table exists');
select has_table('public', 'professional_travel_zones', 'professional travel zones table exists');
select has_table('public', 'professional_documents', 'professional documents table exists');
select fk_ok(
  'public',
  'professional_documents',
  'professional_id',
  'public',
  'profiles',
  'user_id',
  'verification documents belong to the private account before public-profile approval'
);
select has_index(
  'public',
  'professional_documents',
  'professional_documents_active_identity_kind_idx',
  'active government ID and selfie evidence is unique per professional'
);
select has_table('public', 'bookings', 'bookings table exists');
select has_column('public', 'bookings', 'client_request_id', 'bookings support idempotent client requests');
select has_column('public', 'bookings', 'cancellation_policy', 'bookings retain the applied cancellation policy');
select has_column('public', 'bookings', 'commission_rate_bps', 'bookings snapshot the configured commission rate');
select has_column('public', 'bookings', 'version', 'bookings support ordered aggregate events');
select has_table('public', 'booking_disputes', 'booking disputes table exists');
select has_table('public', 'safety_incidents', 'safety incidents table exists');
select has_table('public', 'booking_assignments', 'booking assignments table exists');
select has_table('public', 'payment_intents', 'payment intents table exists');
select has_column('public', 'payment_intents', 'refunded_amount', 'payment intents record full or partial refund amounts');
select has_column('public', 'payment_intents', 'version', 'payment intents support ordered aggregate events');
select has_table('public', 'payment_events', 'payment events table exists');
select has_table('public', 'ledger_entries', 'ledger entries table exists');
select has_table('public', 'payout_batches', 'payout batches table exists');
select has_column('public', 'payout_batches', 'version', 'payout batches support ordered aggregate events');
select has_table('public', 'booking_status_events', 'booking status events table exists');
select has_table('public', 'professional_earnings', 'professional earnings table exists');
select has_table('public', 'favorites', 'favorites table exists');
select has_table('public', 'reviews', 'reviews table exists');
select has_table('public', 'professional_quality_flags', 'professional quality flags table exists');

select policies_are(
  'public',
  'profiles',
  array['profiles_select_self_or_admin', 'profiles_update_self_or_admin'],
  'profiles expose only self/admin policies'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'account_role', 'UPDATE'),
  'authenticated users cannot change their own account role'
);
select ok(
  to_regprocedure('private.is_admin()') is not null,
  'administrator authorization helper lives in the private schema'
);
select ok(
  to_regprocedure('public.is_admin()') is null,
  'administrator authorization helper is not exposed through public RPC'
);
select policies_are(
  'public',
  'domain_event_outbox',
  array['domain_event_outbox_server_only'],
  'domain event outbox has an explicit client deny policy'
);
select policies_are(
  'public',
  'bookings',
  array['bookings_participant_or_admin_read'],
  'bookings are readable only through the participant/admin policy'
);
select policies_are(
  'public',
  'professional_documents',
  array[
    'professional_documents_owner_or_admin_read',
    'professional_documents_owner_insert',
    'professional_documents_admin_update',
    'professional_documents_owner_or_admin_delete'
  ],
  'professional document metadata has explicit private policies'
);
select policies_are(
  'storage',
  'objects',
  array[
    'professional_documents_storage_insert',
    'professional_documents_storage_read',
    'professional_documents_storage_delete'
  ],
  'professional document files have explicit private policies'
);
select ok(
  position('status <> ' in coalesce((
    select qual from pg_policies
    where schemaname = 'public'
      and tablename = 'professional_documents'
      and policyname = 'professional_documents_owner_or_admin_delete'
  ), '')) > 0,
  'professionals cannot delete approved document metadata'
);
select ok(
  position('approved' in coalesce((
    select qual from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'professional_documents_storage_delete'
  ), '')) > 0,
  'professionals cannot delete approved document objects directly'
);
select ok(
  position('storage.extension' in coalesce((
    select with_check from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'professional_documents_storage_insert'
  ), '')) > 0,
  'professional document uploads restrict extensions by semantic folder'
);
select has_function(
  'public',
  'review_professional_document',
  array['uuid', 'professional_document_status', 'text'],
  'professional document review is exposed as one audited command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.review_professional_document(uuid, professional_document_status, text)',
    'EXECUTE'
  ),
  'authenticated administrators can invoke the guarded review command'
);
select ok(
  not has_table_privilege('authenticated', 'public.professional_documents', 'UPDATE'),
  'authenticated callers cannot bypass the audited document review command'
);
select policies_are(
  'public',
  'professional_identity_verifications',
  array['professional_identity_verifications_server_only'],
  'professional identity verification is server-only'
);
select has_function('public', 'record_professional_identity_verification',
  array['uuid', 'text', 'timestamp with time zone'], 'Fayda verification has one server command');
select has_function('public', 'submit_professional_application',
  array['uuid', 'text', 'jsonb', 'timestamp with time zone'], 'application submission is atomic');
select has_function('public', 'get_professional_application',
  array['uuid'], 'application reads use the Postgres projection');
select has_function('public', 'list_professional_applications',
  array['professional_application_status'], 'administrator application queue uses Postgres');
select has_function('public', 'review_professional_application',
  array['uuid', 'uuid', 'text', 'timestamp with time zone'], 'application review and publication are atomic');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.submit_professional_application(uuid, text, jsonb, timestamp with time zone)',
    'EXECUTE'
  ),
  'mobile clients cannot bypass the backend onboarding command'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.submit_professional_application(uuid, text, jsonb, timestamp with time zone)',
    'EXECUTE'
  ),
  'the backend service role can submit professional applications'
);
select has_function('public', 'list_approved_professional_portfolio_paths',
  array['uuid'], 'approved portfolio publication has one server-only query');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_approved_professional_portfolio_paths(uuid)',
    'EXECUTE'
  ),
  'mobile clients cannot read private portfolio storage paths'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_approved_professional_portfolio_paths(uuid)',
    'EXECUTE'
  ),
  'the backend service role can request approved portfolio paths'
);
select has_function('public', 'list_marketplace_professionals',
  array['jsonb', 'date'], 'marketplace discovery uses the Postgres projection');
select has_function('public', 'get_marketplace_professional_availability',
  array['uuid', 'date', 'text', 'text'], 'availability is calculated by Postgres');
select has_function('public', 'record_client_identity_verification',
  array['uuid', 'text', 'timestamp with time zone'], 'client Fayda results use a server command');
select has_function('public', 'get_client_identity_verification',
  array['uuid'], 'client Fayda state can be restored from Postgres');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_marketplace_professionals(jsonb, date)',
    'EXECUTE'
  ),
  'clients cannot invoke server projection functions directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_marketplace_professionals(jsonb, date)',
    'EXECUTE'
  ),
  'the backend service role can read the marketplace projection'
);
select has_function('public', 'quote_marketplace_booking',
  array['jsonb'], 'booking quotes are calculated from authoritative Postgres state');
select has_function('public', 'commit_marketplace_booking',
  array['jsonb', 'jsonb'], 'booking request, assignment, and event commit without payment');
select hasnt_function('public', 'commit_marketplace_booking',
  array['jsonb', 'jsonb', 'jsonb'], 'legacy pre-acceptance payment booking command is removed');
select has_function('public', 'get_booking_payment_context',
  array['uuid', 'uuid'], 'accepted booking payment context is read authoritatively');
select has_function('public', 'commit_booking_payment_intent',
  array['uuid', 'uuid', 'jsonb', 'timestamp with time zone'], 'payment starts in a separate accepted-booking command');
select has_function('public', 'list_client_bookings',
  array['uuid'], 'client booking history uses the Postgres projection');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.commit_marketplace_booking(jsonb, jsonb)',
    'EXECUTE'
  ),
  'mobile clients cannot bypass trusted booking creation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.commit_marketplace_booking(jsonb, jsonb)',
    'EXECUTE'
  ),
  'the backend service role can commit bookings'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.commit_booking_payment_intent(uuid, uuid, jsonb, timestamp with time zone)',
    'EXECUTE'
  ),
  'mobile clients cannot bypass accepted-booking payment initiation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.commit_booking_payment_intent(uuid, uuid, jsonb, timestamp with time zone)',
    'EXECUTE'
  ),
  'the backend service role can initiate accepted-booking payments'
);
select has_function('public', 'get_professional_dashboard',
  array['uuid', 'timestamp with time zone'], 'professional dashboard uses the Postgres projection');
select has_function('public', 'get_professional_catalog_settings',
  array['uuid'], 'professional catalog settings use the Postgres projection');
select has_function('public', 'list_professional_payouts',
  array['uuid'], 'professional payout history uses the Postgres projection');
select has_function('public', 'decline_professional_booking_request',
  array['uuid', 'uuid', 'timestamp with time zone'], 'professional decline cancels an unpaid request');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.decline_professional_booking_request(uuid, uuid, timestamp with time zone)',
    'EXECUTE'
  ),
  'mobile clients cannot bypass professional decline orchestration'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.decline_professional_booking_request(uuid, uuid, timestamp with time zone)',
    'EXECUTE'
  ),
  'the backend service role can decline unpaid booking requests'
);
select has_function('public', 'update_professional_catalog',
  array['uuid', 'jsonb', 'timestamp with time zone'], 'professional catalog updates are atomic');
select has_function('public', 'set_professional_availability',
  array['uuid', 'boolean', 'timestamp with time zone'], 'professional availability has one guarded command');
select has_function('public', 'transition_professional_booking',
  array['uuid', 'uuid', 'text', 'timestamp with time zone', 'numeric'], 'professional booking transitions are atomic');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.transition_professional_booking(uuid, uuid, text, timestamp with time zone, numeric)',
    'EXECUTE'
  ),
  'mobile clients cannot invoke professional transitions directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.transition_professional_booking(uuid, uuid, text, timestamp with time zone)',
    'EXECUTE'
  ),
  'the backend service role can transition professional bookings'
);
select has_function('public', 'reschedule_client_booking',
  array['uuid', 'uuid', 'date', 'text', 'timestamp with time zone'], 'client rescheduling is atomic');
select has_function('public', 'cancel_client_booking',
  array['uuid', 'uuid', 'timestamp with time zone'], 'client cancellation and settlement are atomic');
select has_function('public', 'submit_client_booking_review',
  array['uuid', 'uuid', 'uuid', 'smallint', 'smallint', 'text[]', 'text', 'timestamp with time zone'],
  'client review submission and rating projection are atomic');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.cancel_client_booking(uuid, uuid, timestamp with time zone)',
    'EXECUTE'
  ),
  'mobile clients cannot invoke booking cancellation directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.cancel_client_booking(uuid, uuid, timestamp with time zone)',
    'EXECUTE'
  ),
  'the backend service role can cancel client bookings'
);
select has_function('public', 'get_client_data', array['uuid'], 'client data has one Postgres projection');
select has_function('public', 'update_client_profile',
  array['uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'client profile updates are atomic');
select has_function('public', 'complete_client_onboarding',
  array['uuid', 'text', 'text', 'text', 'jsonb', 'timestamp with time zone'], 'client onboarding is atomic');
select has_function('public', 'create_client_address',
  array['uuid', 'uuid', 'text', 'text', 'text', 'boolean', 'timestamp with time zone'], 'address creation is atomic');
select has_function('public', 'update_client_address',
  array['uuid', 'uuid', 'text', 'text', 'text', 'timestamp with time zone'], 'address updates are atomic');
select has_function('public', 'delete_client_address',
  array['uuid', 'uuid', 'timestamp with time zone'], 'address deletion repairs the default atomically');
select has_function('public', 'set_default_client_address',
  array['uuid', 'uuid', 'timestamp with time zone'], 'default address selection is atomic');
select has_function('public', 'set_client_favorite',
  array['uuid', 'uuid', 'boolean', 'timestamp with time zone'], 'client favourites use Postgres');
select has_function('public', 'update_client_notification_preferences',
  array['uuid', 'jsonb', 'timestamp with time zone'], 'notification preferences use Postgres');
select has_function('public', 'register_client_device',
  array['uuid', 'uuid', 'text', 'text', 'timestamp with time zone'], 'device registration uses Postgres');
select has_function('public', 'unregister_client_device',
  array['uuid', 'uuid', 'timestamp with time zone'], 'device unregistration uses Postgres');
select has_function('public', 'list_client_notifications',
  array['uuid'], 'notification history uses Postgres');
select has_function('public', 'audit_client_payment_ledger',
  array['uuid', 'uuid'], 'client ledger audit uses Postgres');
select has_function('public', 'delete_konjo_account',
  array['uuid', 'account_role', 'timestamp with time zone'], 'account deletion is guarded and retention-aware');
select ok(
  not has_function_privilege('authenticated', 'public.get_client_data(uuid)', 'EXECUTE'),
  'mobile clients cannot invoke the server client-data projection directly'
);
select ok(
  has_function_privilege('service_role', 'public.get_client_data(uuid)', 'EXECUTE'),
  'the backend service role can read the client-data projection'
);
select has_function('public', 'process_provider_payment_event',
  array['text', 'booking_payment_method', 'text', 'payment_status', 'text', 'timestamp with time zone'],
  'provider payment events are processed atomically');
select has_function('public', 'queue_professional_payout',
  array['uuid', 'uuid', 'timestamp with time zone'], 'professional payout queueing is atomic');
select has_function('public', 'settle_professional_payout',
  array['uuid', 'uuid', 'timestamp with time zone', 'text', 'text', 'uuid'], 'professional payout settlement is atomic and records the transfer reference');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.process_provider_payment_event(text, booking_payment_method, text, payment_status, text, timestamp with time zone)',
    'EXECUTE'
  ),
  'mobile clients cannot invoke payment webhooks directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.process_provider_payment_event(text, booking_payment_method, text, payment_status, text, timestamp with time zone)',
    'EXECUTE'
  ),
  'the backend service role can process payment webhooks'
);
select has_function('public', 'enqueue_notification',
  array['uuid', 'text', 'text', 'text', 'jsonb', 'timestamp with time zone'],
  'notification projection uses a server command');
select has_function('public', 'claim_domain_events',
  array['text', 'timestamp with time zone', 'timestamp with time zone', 'integer'],
  'domain events support leased claims');
select has_function('public', 'mark_domain_event_processed',
  array['uuid', 'text', 'timestamp with time zone'], 'domain event completion is atomic');
select has_function('public', 'record_domain_event_failure',
  array['uuid', 'text', 'timestamp with time zone', 'timestamp with time zone', 'text', 'boolean'],
  'domain event retries and dead letters are persisted');
select has_function('public', 'list_failed_domain_events',
  array['integer'], 'dead letters can be inspected');
select has_function('public', 'replay_failed_domain_event',
  array['uuid', 'uuid', 'timestamp with time zone'], 'administrators can replay dead letters');
select has_function('public', 'reassign_overdue_bookings',
  array['timestamp with time zone'], 'overdue booking assignment uses Postgres');
select has_function('public', 'enqueue_due_booking_reminders',
  array['timestamp with time zone'], 'booking reminders use Postgres');
select has_function('public', 'claim_due_notification_jobs',
  array['timestamp with time zone', 'integer'], 'notification delivery supports leased claims');
select has_function('public', 'record_notification_delivery',
  array['jsonb', 'jsonb', 'timestamp with time zone'], 'notification delivery attempts are persisted');
select ok(
  not has_function_privilege('authenticated', 'public.claim_domain_events(text, timestamp with time zone, timestamp with time zone, integer)', 'EXECUTE'),
  'mobile clients cannot claim domain events'
);
select ok(
  has_function_privilege('service_role', 'public.claim_domain_events(text, timestamp with time zone, timestamp with time zone, integer)', 'EXECUTE'),
  'the backend service role can claim domain events'
);
select has_function('public', 'open_safety_incident',
  array['uuid', 'uuid', 'account_role', 'uuid', 'double precision', 'double precision', 'double precision', 'timestamp with time zone'],
  'SOS incidents use an atomic Postgres command');
select has_function('public', 'open_booking_dispute',
  array['uuid', 'uuid', 'uuid', 'text', 'timestamp with time zone'],
  'booking disputes use an atomic Postgres command');
select has_function('public', 'resolve_safety_incident',
  array['uuid', 'uuid', 'uuid', 'text', 'timestamp with time zone'],
  'safety resolution is audited atomically');
select has_function('public', 'resolve_professional_quality_flag',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'timestamp with time zone'],
  'quality resolution is audited atomically');
select has_function('public', 'resolve_booking_dispute',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'timestamp with time zone'],
  'dispute resolution is audited atomically');
select ok(
  not has_function_privilege('authenticated', 'public.open_safety_incident(uuid, uuid, account_role, uuid, double precision, double precision, double precision, timestamp with time zone)', 'EXECUTE'),
  'mobile clients cannot invoke the SOS persistence command directly'
);
select ok(
  has_function_privilege('service_role', 'public.open_safety_incident(uuid, uuid, account_role, uuid, double precision, double precision, double precision, timestamp with time zone)', 'EXECUTE'),
  'the backend service role can persist SOS incidents'
);
select has_function('public', 'get_admin_summary', array[]::text[], 'administrator summary uses Postgres');
select has_function('public', 'get_admin_platform_settings', array[]::text[], 'administrator settings use Postgres');
select has_function('public', 'list_admin_professionals', array[]::text[], 'administrator professionals use Postgres');
select has_function('public', 'list_admin_bookings', array['jsonb', 'integer'], 'administrator bookings use Postgres');
select has_function('public', 'list_admin_payouts', array[]::text[], 'administrator payouts use Postgres');
select has_function('public', 'list_admin_revenue_rows', array[]::text[], 'administrator revenue uses Postgres');
select has_function('public', 'list_admin_audit_logs', array['integer'], 'administrator audits use Postgres');
select has_function('public', 'list_admin_zones', array[]::text[], 'administrator zones use Postgres');
select has_function('public', 'list_admin_disputes', array[]::text[], 'administrator disputes use Postgres');
select has_function('public', 'list_admin_quality_flags', array[]::text[], 'administrator quality flags use Postgres');
select has_function('public', 'list_admin_safety_incidents', array[]::text[], 'administrator incidents use Postgres');
select has_function('public', 'list_admin_broadcasts', array[]::text[], 'administrator broadcasts use Postgres');
select ok(
  not has_function_privilege('authenticated', 'public.get_admin_summary()', 'EXECUTE'),
  'mobile clients cannot invoke administrator projections'
);
select ok(
  has_function_privilege('service_role', 'public.get_admin_summary()', 'EXECUTE'),
  'the backend service role can invoke administrator projections'
);
select has_function('public', 'upsert_admin_service_category',
  array['uuid','uuid','timestamp with time zone','uuid','text','text','boolean','integer'],
  'administrator category updates use Postgres');
select has_function('public', 'update_admin_commission',
  array['uuid','uuid','timestamp with time zone','integer'], 'administrator commission updates use Postgres');
select has_function('public', 'upsert_admin_zone',
  array['uuid','uuid','timestamp with time zone','uuid','text','numeric','boolean'],
  'administrator zone updates use Postgres');
select has_function('public', 'create_admin_promotion',
  array['uuid','uuid','timestamp with time zone','uuid','text','text','integer','boolean','timestamp with time zone','timestamp with time zone'],
  'administrator promotion creation uses Postgres');
select has_function('public', 'set_admin_promotion_active',
  array['uuid','uuid','timestamp with time zone','uuid','boolean'], 'administrator promotion state uses Postgres');
select has_function('public', 'create_admin_broadcast',
  array['uuid','uuid','timestamp with time zone','uuid','text','text'], 'administrator broadcasts use Postgres');
select has_function('public', 'update_admin_professional',
  array['uuid','uuid','timestamp with time zone','uuid','boolean','boolean'], 'administrator merchandising uses Postgres');
select has_function('public', 'set_admin_professional_state',
  array['uuid','uuid','timestamp with time zone','uuid','text'], 'administrator professional state uses Postgres');
select has_function('public', 'record_admin_audit',
  array['uuid','uuid','text','text','text','jsonb','timestamp with time zone'], 'administrator export audits use Postgres');
select has_function('public', 'refund_admin_booking',
  array['uuid','uuid','uuid','timestamp with time zone'], 'administrator refunds use Postgres');
select ok(
  not has_function_privilege('authenticated', 'public.upsert_admin_service_category(uuid, uuid, timestamp with time zone, uuid, text, text, boolean, integer)', 'EXECUTE'),
  'mobile clients cannot invoke administrator mutations'
);
select ok(
  has_function_privilege('service_role', 'public.upsert_admin_service_category(uuid, uuid, timestamp with time zone, uuid, text, text, boolean, integer)', 'EXECUTE'),
  'the backend service role can invoke administrator mutations'
);
select ok(
  not has_function_privilege('authenticated', 'public.refund_admin_booking(uuid, uuid, uuid, timestamp with time zone)', 'EXECUTE'),
  'mobile clients cannot invoke administrator refunds'
);
select ok(
  has_function_privilege('service_role', 'public.refund_admin_booking(uuid, uuid, uuid, timestamp with time zone)', 'EXECUTE'),
  'the backend service role can invoke administrator refunds'
);

select * from finish();
rollback;

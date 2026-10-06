import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrationPath = resolve(migrationsDirectory, '202609170001_initial_konjo_schema.sql');
const migration = readFileSync(migrationPath, 'utf8');
const identityEvidenceMigration = readFileSync(
  resolve(migrationsDirectory, '202609180007_enforce_professional_document_evidence.sql'),
  'utf8',
);
const documentFileKindMigration = readFileSync(
  resolve(migrationsDirectory, '202609180008_restrict_professional_document_file_kinds.sql'),
  'utf8',
);
const onboardingWorkflowMigration = readFileSync(
  resolve(migrationsDirectory, '202609180009_professional_onboarding_workflow.sql'),
  'utf8',
);
const portfolioPublicationMigration = readFileSync(
  resolve(migrationsDirectory, '202609180010_publish_approved_portfolio_media.sql'),
  'utf8',
);
const marketplaceProjectionMigration = readFileSync(
  resolve(migrationsDirectory, '202609180011_marketplace_and_availability_projection.sql'),
  'utf8',
);
const bookingProjectionMigration = readFileSync(
  resolve(migrationsDirectory, '202609180012_booking_creation_projection.sql'),
  'utf8',
);
const professionalOperationsMigration = readFileSync(
  resolve(migrationsDirectory, '202609180013_professional_operations_projection.sql'),
  'utf8',
);
const clientBookingLifecycleMigration = readFileSync(
  resolve(migrationsDirectory, '202609180014_client_booking_lifecycle.sql'),
  'utf8',
);
const clientDataMigration = readFileSync(
  resolve(migrationsDirectory, '202609180015_client_data_projection.sql'),
  'utf8',
);
const accountDeletionCleanupMigration = readFileSync(
  resolve(migrationsDirectory, '202609180016_delete_account_notification_cleanup.sql'),
  'utf8',
);
const paymentOperationsMigration = readFileSync(
  resolve(migrationsDirectory, '202609180017_payment_and_payout_operations.sql'),
  'utf8',
);
const eventWorkerMigration = readFileSync(
  resolve(migrationsDirectory, '202609180018_event_and_notification_workers.sql'),
  'utf8',
);
const notificationDeliveryFixMigration = readFileSync(
  resolve(migrationsDirectory, '202609180019_fix_notification_delivery_attempt.sql'),
  'utf8',
);
const trustSafetyMigration = readFileSync(
  resolve(migrationsDirectory, '202609180020_trust_and_safety_operations.sql'),
  'utf8',
);
const adminReadMigration = readFileSync(
  resolve(migrationsDirectory, '202609180021_admin_read_projection.sql'),
  'utf8',
);
const adminOperationsMigration = readFileSync(
  resolve(migrationsDirectory, '202609180022_admin_catalog_and_professional_operations.sql'),
  'utf8',
);
const adminRefundMigration = readFileSync(
  resolve(migrationsDirectory, '202609180023_admin_refund_operation.sql'),
  'utf8',
);
const paymentAfterAcceptanceMigration = readFileSync(
  resolve(migrationsDirectory, '202609180024_payment_after_professional_acceptance.sql'),
  'utf8',
);
const unpaidDeclineMigration = readFileSync(
  resolve(migrationsDirectory, '202609180025_decline_unpaid_booking_request.sql'),
  'utf8',
);
const retentionAwareDeletionMigration = readFileSync(
  resolve(migrationsDirectory, '202609180026_retention_aware_account_deletion.sql'),
  'utf8',
);
const manualIdentityReviewMigration = readFileSync(
  resolve(migrationsDirectory, '202609190003_manual_identity_review.sql'),
  'utf8',
);
const documentsOnlyIdentityMigration = readFileSync(
  resolve(migrationsDirectory, '202609190004_documents_only_professional_identity.sql'),
  'utf8',
);
const additionalProfessionalIdMigration = readFileSync(
  resolve(migrationsDirectory, '202609190005_require_additional_professional_id.sql'),
  'utf8',
);
const professionalApprovalNotificationMigration = readFileSync(
  resolve(migrationsDirectory, '202609190006_professional_approval_notification.sql'),
  'utf8',
);
const authenticatedProfessionalApplicationMigration = readFileSync(
  resolve(migrationsDirectory, '202609190007_authenticated_professional_application.sql'),
  'utf8',
);
const travelFeeCapMigration = readFileSync(
  resolve(migrationsDirectory, '202609230001_admin_travel_fee_cap.sql'),
  'utf8',
);
const clientServiceFeeMigration = readFileSync(
  resolve(migrationsDirectory, '202609230003_client_service_fee.sql'),
  'utf8',
);
const restoredProjectionsMigration = readFileSync(
  resolve(migrationsDirectory, '202609230004_restore_split_payment_projections.sql'),
  'utf8',
);
const payoutMethodMigration = readFileSync(
  resolve(migrationsDirectory, '202609230007_professional_payout_method.sql'),
  'utf8',
);
const futureBookingGuardMigration = readFileSync(
  resolve(migrationsDirectory, '202609300004_future_booking_start_and_active_availability.sql'),
  'utf8',
);
const fullDayAvailabilityMigration = readFileSync(
  resolve(migrationsDirectory, '202609300005_full_day_availability.sql'),
  'utf8',
);

function captures(pattern: RegExp): string[] {
  return [...migration.matchAll(pattern)].map((match) => match[1].toLowerCase());
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

assert.deepEqual(
  duplicates(captures(/create\s+trigger\s+([a-z_][a-z0-9_]*)/gi)),
  [],
  'migration must not declare a trigger more than once',
);
assert.deepEqual(
  duplicates(captures(/create\s+policy\s+([a-z_][a-z0-9_]*)/gi)),
  [],
  'migration must not declare a policy more than once',
);
for (const file of migrationFiles) {
  const source = readFileSync(resolve(migrationsDirectory, file), 'utf8');
  assert.doesNotMatch(
    source,
    /\b(?:copy\b[^;]*\bfrom\s+program|pg_read_file|pg_ls_dir|lo_import)\b/i,
    `${file} must not execute operating-system or server-file commands`,
  );
  assert.match(source, /^begin;/i, `${file} must start a transaction`);
  assert.match(source, /commit;\s*$/i, `${file} must commit its transaction`);
}
assert.match(
  migration,
  /grant update \(full_name, preferred_language, onboarding_completed_at\) on public\.profiles to authenticated;/i,
  'profile updates must use a safe column allowlist',
);
assert.match(
  documentFileKindMigration,
  /storage\.foldername\(name\)\)\[2\][\s\S]*storage\.extension\(name\)/i,
  'professional document Storage writes must restrict extensions by document-kind folder',
);
assert.doesNotMatch(
  migration,
  /grant update \([^)]*account_role[^)]*\) on public\.profiles to authenticated;/i,
  'authenticated users must not be able to update account roles',
);
assert.match(
  identityEvidenceMigration,
  /create unique index professional_documents_active_identity_kind_idx[\s\S]*kind in \('government_id', 'selfie'\)[\s\S]*status in \('pending', 'approved'\)/i,
  'active government ID and selfie evidence must be unique per professional',
);
assert.match(
  onboardingWorkflowMigration,
  /revoke all on function public\.submit_professional_application[\s\S]*from public, anon, authenticated;/i,
  'professional application commands must not be callable by mobile clients',
);
assert.match(
  professionalApprovalNotificationMigration,
  /status = next_status[\s\S]*if next_status = 'approved'[\s\S]*'ProfessionalApproved'[\s\S]*professionalId[\s\S]*applicationId/i,
  'professional approval must atomically emit the event that projects the approval SMS',
);
assert.match(
  authenticatedProfessionalApplicationMigration,
  /submit_my_professional_application[\s\S]*professional_id uuid := auth\.uid\(\)[\s\S]*account_role = 'professional'[\s\S]*submit_professional_application\([\s\S]*professional_id/i,
  'mobile professional submission must bind the transactional command to the authenticated professional',
);
assert.match(
  authenticatedProfessionalApplicationMigration,
  /revoke all on function public\.submit_my_professional_application[\s\S]*from public, anon[\s\S]*grant execute[\s\S]*to authenticated/i,
  'the self-service professional command must not be exposed to anonymous clients',
);
assert.match(
  portfolioPublicationMigration,
  /document\.kind = 'portfolio'[\s\S]*document\.status = 'approved'[\s\S]*profile\.approval_status = 'approved'[\s\S]*not profile\.is_hidden/i,
  'portfolio publication must require approved media on an approved visible profile',
);
assert.match(
  marketplaceProjectionMigration,
  /booking\.scheduled_start < slot_end[\s\S]*booking\.scheduled_start \+ make_interval\(mins => booking\.duration_minutes\) > slot_start/i,
  'Postgres availability must reject overlapping booking intervals',
);
// "On a visit" stays on_the_way/in_progress (202609300003): accepted future
// bookings must not reserve the professional, or nobody could book weeks ahead.
assert.doesNotMatch(
  futureBookingGuardMigration,
  /function private\.professional_on_visit\(/i,
  'the on-visit rule is defined once (202609300003) and must not be widened to accepted bookings here',
);
assert.match(
  fullDayAvailabilityMigration,
  /interval '30 minutes'[\s\S]*generate_series\(0, 47\)/i,
  'availability must evaluate the complete 24-hour day in half-hour increments',
);
assert.match(
  fullDayAvailabilityMigration,
  /slot_start < working_start_at[\s\S]*slot_end > working_end_at[\s\S]*slot_start <= now\(\)/i,
  'full-day slots must still respect working hours and elapsed time',
);
assert.match(
  fullDayAvailabilityMigration,
  /booking\.scheduled_start < slot_end[\s\S]*booking\.scheduled_start \+ make_interval\(mins => booking\.duration_minutes\) > slot_start/i,
  'full-day availability must reject every overlapping booked interval',
);
assert.match(
  futureBookingGuardMigration,
  /professional_availability_api[\s\S]*status in \('on_the_way', 'in_progress'\)[\s\S]*'slots', '\[\]'::jsonb/i,
  'a professional on the way or mid-visit must show no marketplace availability slots',
);
assert.match(
  futureBookingGuardMigration,
  /p_action = 'travel'[\s\S]*p_occurred_at < scheduled_start - interval '3 hours'[\s\S]*return 'too_early'/i,
  'travel may start up to three hours before the appointment, not days early',
);
assert.match(
  paymentAfterAcceptanceMigration,
  /create function public\.commit_marketplace_booking\([\s\S]*insert into public\.bookings[\s\S]*'BookingRequested'[\s\S]*'paymentIntent', null/i,
  'booking requests must persist without creating a payment intent',
);
assert.match(
  unpaidDeclineMigration,
  /booking\.status <> 'requested'[\s\S]*payment_intents[\s\S]*cancellation_policy = null[\s\S]*'BookingDeclined'[\s\S]*'paymentTaken', false/i,
  'professional decline must cancel an unpaid request without refund state and emit the decline event',
);
assert.match(
  paymentAfterAcceptanceMigration,
  /where id = p_booking_id and client_id = p_client_id[\s\S]*booking\.status <> 'accepted'[\s\S]*insert into public\.payment_intents[\s\S]*'PaymentAuthorizationRequested'/i,
  'payment initiation must lock an accepted client booking before persisting the intent and event',
);
assert.match(
  professionalOperationsMigration,
  /for update[\s\S]*version = version \+ 1[\s\S]*insert into public\.domain_event_outbox/i,
  'professional booking transitions must lock, version, and emit atomically',
);
assert.match(
  clientBookingLifecycleMigration,
  /professional_availability_api[\s\S]*booking_scheduled_start[\s\S]*BookingRescheduled/i,
  'rescheduling must revalidate availability before atomically moving the booking',
);
assert.match(
  clientDataMigration,
  /for update[\s\S]*is_default = false[\s\S]*is_default = true/i,
  'default-address changes must serialize and preserve one default',
);
assert.match(
  paymentOperationsMigration,
  /payload_hash <> p_payload_hash[\s\S]*'duplicate'[\s\S]*unique_violation/i,
  'payment webhooks must reject altered replays and resolve concurrent duplicates',
);
assert.match(
  paymentOperationsMigration,
  /'capture:'[\s\S]*provider_clearing[\s\S]*escrow_liability[\s\S]*PaymentCaptured/i,
  'captured provider payments must write a balanced ledger group and event',
);
assert.match(
  paymentOperationsMigration,
  /for update[\s\S]*payout_id is null[\s\S]*claimed_count <> payout_count/i,
  'payout queueing must lock and claim every selected earning atomically',
);
assert.match(
  paymentOperationsMigration,
  /revoke all on function public\.process_provider_payment_event[\s\S]*from public, anon, authenticated;/i,
  'payment and payout commands must remain backend-only',
);
assert.match(
  eventWorkerMigration,
  /claim_domain_events[\s\S]*for update skip locked[\s\S]*locked_by = p_worker_id[\s\S]*locked_until = p_locked_until/i,
  'domain event workers must use bounded exclusive leases',
);
assert.match(
  eventWorkerMigration,
  /enqueue_notification[\s\S]*on conflict \(idempotency_key\) do nothing/i,
  'notification projection must remain idempotent',
);
assert.match(
  eventWorkerMigration,
  /reassign_overdue_bookings[\s\S]*professional_availability_api[\s\S]*booking_assignments[\s\S]*BookingReassigned/i,
  'overdue reassignment must avoid prior assignees, revalidate availability, and emit an event',
);
assert.match(
  eventWorkerMigration,
  /record_notification_delivery[\s\S]*attempt >= 3[\s\S]*next_attempt_at = next_attempt/i,
  'notification delivery must retain attempts and bounded retries',
);
assert.match(
  notificationDeliveryFixMigration,
  /v_attempt integer[\s\S]*values \([\s\S]*v_attempt[\s\S]*v_attempt >= 3/i,
  'notification delivery must disambiguate the attempt variable from its table column',
);
assert.match(
  eventWorkerMigration,
  /revoke all on function public\.enqueue_notification[\s\S]*from public, anon, authenticated;/i,
  'event and notification worker commands must remain backend-only',
);
assert.match(
  trustSafetyMigration,
  /open_safety_incident[\s\S]*for update[\s\S]*SafetyIncidentOpened[\s\S]*counterpartId/i,
  'SOS creation must lock the booking and atomically emit its counterpart event',
);
assert.match(
  trustSafetyMigration,
  /safety_incidents_one_open_reporter_idx[\s\S]*where status = 'open'/i,
  'SOS idempotency must be protected by a partial unique index',
);
assert.match(
  trustSafetyMigration,
  /resolve_professional_quality_flag[\s\S]*status = 'resolved'[\s\S]*not exists[\s\S]*is_hidden = false[\s\S]*admin_audit_logs/i,
  'quality restoration must require all flags resolved and write an audit atomically',
);
assert.match(
  trustSafetyMigration,
  /revoke all on function public\.open_safety_incident[\s\S]*from public, anon, authenticated;/i,
  'trust-and-safety commands must remain backend-only',
);
assert.match(
  adminReadMigration,
  /list_admin_bookings[\s\S]*private\.booking_api[\s\S]*dateFrom[\s\S]*professionalId[\s\S]*limit greatest\(1, least\(p_limit, 10000\)\)/i,
  'administrator booking reads must preserve the API projection and bounded server filters',
);
assert.match(
  adminReadMigration,
  /list_admin_revenue_rows[\s\S]*payment\.amount - payment\.refunded_amount[\s\S]*professional_earnings/i,
  'administrator revenue reads must derive net collection and earning splits from authoritative finance rows',
);
assert.match(
  adminReadMigration,
  /revoke all on function public\.get_admin_summary\(\)[\s\S]*from public, anon, authenticated;/i,
  'administrator projections must remain backend-only',
);
assert.match(
  adminOperationsMigration,
  /create_admin_broadcast[\s\S]*notification_outbox[\s\S]*on conflict \(idempotency_key\) do nothing[\s\S]*admin_audit_logs/i,
  'administrator broadcasts must atomically create idempotent notifications and an audit',
);
assert.match(
  adminOperationsMigration,
  /set_admin_professional_state[\s\S]*is_hidden[\s\S]*professional_quality_flags[\s\S]*admin_audit_logs/i,
  'professional restoration must preserve quality holds and audit the transition',
);
assert.match(
  adminRefundMigration,
  /for update[\s\S]*payout_locked[\s\S]*admin-retained-refund[\s\S]*release-reversal[\s\S]*PaymentRefunded[\s\S]*payment\.refunded/i,
  'administrator refunds must lock finance state, honor payout claims, reverse ledger balances, emit, and audit atomically',
);
assert.match(
  adminOperationsMigration,
  /revoke all on function public\.upsert_admin_service_category[\s\S]*from public, anon, authenticated;/i,
  'administrator mutation commands must remain backend-only',
);
assert.match(
  clientDataMigration,
  /audit_client_payment_ledger[\s\S]*bool_and\(grouped\.total = 0\)/i,
  'client ledger audits must verify every entry group is balanced',
);
assert.match(
  clientDataMigration,
  /banned_until[\s\S]*full_name = 'Deleted account'[\s\S]*onboarding_completed_at = null/i,
  'accounts with retained financial records must be banned and anonymized',
);
assert.match(
  accountDeletionCleanupMigration,
  /delete from public\.notification_outbox where user_id = p_user_id/i,
  'account deletion must remove personal notification payloads',
);
assert.match(
  retentionAwareDeletionMigration,
  /delete from public\.professional_documents[\s\S]*address_detail = 'Removed after account deletion'[\s\S]*review_text = ''[\s\S]*safety_incidents[\s\S]*'AccountDeleted'/i,
  'account deletion must scrub retained PII and atomically enqueue private-asset cleanup',
);
assert.match(
  manualIdentityReviewMigration,
  /create table public\.client_identity_documents[\s\S]*enable row level security[\s\S]*client_identity_storage_insert/i,
  'client identity documents must use a dedicated RLS-protected private storage flow',
);
assert.match(
  manualIdentityReviewMigration,
  /review_client_identity_document[\s\S]*admin_audit_logs[\s\S]*domain_event_outbox/i,
  'client document decisions must be audited and emit an outbox event atomically',
);
assert.match(
  manualIdentityReviewMigration,
  /enforce_professional_manual_identity_documents[\s\S]*national_id_front[\s\S]*national_id_back[\s\S]*status = 'approved'/i,
  'professional approval must require approved front and back ID evidence',
);
assert.match(
  documentsOnlyIdentityMigration,
  /drop function if exists public\.record_manual_professional_identity_submission[\s\S]*drop column if exists fayda_last_four[\s\S]*drop table if exists public\.professional_identity_verifications/i,
  'professional onboarding must remove identity-number submission and storage',
);
assert.doesNotMatch(
  documentsOnlyIdentityMigration.match(/create or replace function public\.submit_professional_application[\s\S]*?\n\$\$;/i)?.[0] ?? '',
  /identity_not_verified|fayda_last_four|professional_identity_verifications/i,
  'professional submission must depend on document evidence instead of an identity number',
);
assert.match(
  additionalProfessionalIdMigration,
  /enforce_professional_manual_identity_documents[\s\S]*national_id_front[\s\S]*national_id_back[\s\S]*government_id[\s\S]*status = 'approved'/i,
  'professional review must require National ID front/back and an additional approved government ID',
);
assert.doesNotMatch(
  retentionAwareDeletionMigration,
  /delete\s+from\s+storage\.objects/i,
  'physical Storage objects must be removed through the Storage API, never through SQL metadata deletion',
);
assert.match(
  clientDataMigration,
  /revoke all on function public\.get_client_data[\s\S]*from public, anon, authenticated;/i,
  'client data projection commands must remain backend-only',
);
assert.match(
  clientBookingLifecycleMigration,
  /travel_fee_forfeit[\s\S]*ledger_entries[\s\S]*professional_earnings[\s\S]*BookingCancelled/i,
  'client cancellation must settle travel-fee retention and emit atomically',
);
assert.match(
  clientBookingLifecycleMigration,
  /insert into public\.reviews[\s\S]*average_rating[\s\S]*ReviewSubmitted[\s\S]*ProfessionalRatingThresholdCrossed/i,
  'review submission must update rating and quality projections with domain events',
);
assert.match(
  clientBookingLifecycleMigration,
  /revoke all on function public\.submit_client_booking_review[\s\S]*from public, anon, authenticated;/i,
  'client booking lifecycle commands must remain backend-only',
);
assert.match(
  professionalOperationsMigration,
  /'capture:'[\s\S]*'release:'[\s\S]*insert into public\.professional_earnings/i,
  'booking completion must balance cash capture, release, and professional earnings',
);
assert.match(
  professionalOperationsMigration,
  /update public\.professional_services[\s\S]*active = false[\s\S]*application_service_reference/i,
  'catalog updates must archive historical services instead of breaking booking references',
);
assert.match(
  professionalOperationsMigration,
  /approval_status = 'approved'[\s\S]*not is_hidden[\s\S]*return found/i,
  'only approved visible professionals may enable availability',
);
assert.match(
  professionalOperationsMigration,
  /revoke all on function public\.transition_professional_booking[\s\S]*from public, anon, authenticated;/i,
  'professional operations must remain backend-only',
);
assert.match(
  paymentAfterAcceptanceMigration,
  /current_quote := public\.quote_marketplace_booking\(p_input\)[\s\S]*current_quote <> p_quote/i,
  'booking commit must revalidate the provider-funded quote',
);
assert.match(
  paymentAfterAcceptanceMigration,
  /unique_violation[\s\S]*find_marketplace_booking_by_request/i,
  'booking creation must resolve idempotency races to the original booking',
);
assert.match(
  marketplaceProjectionMigration,
  /professional\.approval_status = 'approved'[\s\S]*not professional\.is_hidden/i,
  'marketplace discovery must publish only approved visible professionals',
);
assert.match(
  marketplaceProjectionMigration,
  /revoke all on function public\.record_client_identity_verification[\s\S]*from public, anon, authenticated;/i,
  'client identity verification persistence must remain backend-only',
);
assert.match(
  portfolioPublicationMigration,
  /revoke all on function public\.list_approved_professional_portfolio_paths\(uuid\)[\s\S]*from public, anon, authenticated;/i,
  'private portfolio storage paths must remain server-only',
);
assert.match(
  onboardingWorkflowMigration,
  /insert into public\.domain_event_outbox[\s\S]*professional\.application_submitted/i,
  'professional application submission must emit a domain event transactionally',
);
assert.match(
  identityEvidenceMigration,
  /storage_path like[\s\S]*auth\.uid\(\)[\s\S]*kind::text/i,
  'professional document metadata must match the owner and document-kind storage path',
);

const tableColumns = new Map<string, Set<string>>();
for (const match of migration.matchAll(/create\s+table\s+public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\);/gi)) {
  const columns = new Set(
    match[2]
      .split('\n')
      .map((line) => line.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]?.toLowerCase())
      .filter((column): column is string => Boolean(column))
      .filter((column) => !['check', 'constraint', 'foreign', 'primary', 'unique'].includes(column)),
  );
  tableColumns.set(match[1].toLowerCase(), columns);
}

for (const match of migration.matchAll(
  /grant\s+(?:insert|update)\s*\(([^)]+)\)\s+on\s+public\.([a-z_][a-z0-9_]*)\s+to\s+authenticated/gi,
)) {
  const table = match[2].toLowerCase();
  const knownColumns = tableColumns.get(table);
  assert.ok(knownColumns, `column grant references unknown table public.${table}`);
  for (const rawColumn of match[1].split(',')) {
    const column = rawColumn.trim().toLowerCase();
    assert.ok(
      knownColumns.has(column),
      `column grant references unknown column public.${table}.${column}`,
    );
  }
}

assert.match(
  travelFeeCapMigration,
  /create or replace function public\.transition_professional_booking\([\s\S]*p_travel_fee numeric default null[\s\S]*from public\.platform_settings where key = 'travel_fee_cap_etb'[\s\S]*return 'invalid_travel_fee'[\s\S]*travel_fee = case when p_action = 'accept' then accepted_travel_fee else travel_fee end/i,
  'the professional travel fee must be validated against the administrator cap inside the accept transaction',
);
assert.match(
  travelFeeCapMigration,
  /create or replace function public\.update_admin_travel_fee_cap\([\s\S]*account_role = 'admin'[\s\S]*'travel_fee_cap\.updated'/i,
  'travel fee cap changes must require the administrator role and be audited',
);
assert.match(
  travelFeeCapMigration,
  /revoke all on function public\.update_admin_travel_fee_cap[\s\S]*from public, anon, authenticated;[\s\S]*revoke all on function public\.transition_professional_booking\(uuid, uuid, text, timestamptz, numeric\) from public, anon, authenticated;/i,
  'travel fee commands must not be callable by mobile clients',
);
assert.match(
  travelFeeCapMigration,
  /quote_marketplace_booking[\s\S]*'travelFee', 0,[\s\S]*'total', service_record\.price,/i,
  'booking quotes must not pre-charge a travel fee: the professional names it on acceptance',
);
assert.match(
  clientServiceFeeMigration,
  /generated always as \(service_price \+ service_fee \+ travel_fee\) stored[\s\S]*service_fee := round\(service_record\.price \* coalesce\(commission, 0\) \/ 10000\.0\)[\s\S]*'serviceFee', service_fee,[\s\S]*'total', service_record\.price \+ service_fee,[\s\S]*coalesce\(\(p_quote ->> 'serviceFee'\)::numeric, 0\)/i,
  'the client service fee must mirror the commission and be part of the stored total, the quote and the committed booking',
);
assert.doesNotMatch(
  travelFeeCapMigration + clientServiceFeeMigration,
  /create (or replace )?function (private\.booking_api|public\.get_professional_dashboard)\(/i,
  'only the newest migration may define the booking document and professional dashboard projections',
);

// The last definition of each projection must carry every field the app reads.
const lastBookingApi = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDirectory, file), 'utf8'))
  .filter((source) => /function private\.booking_api\(/i.test(source))
  .at(-1) ?? '';
assert.match(
  lastBookingApi,
  /'paymentSummary', private\.booking_payment_summary\(booking\.id\)[\s\S]*'payments', coalesce\([\s\S]*'acceptedAt', booking\.accepted_at[\s\S]*'serviceFee', booking\.service_fee[\s\S]*'travelFee', booking\.travel_fee/i,
  'the latest booking document projection must keep split-payment fields and the service fee',
);
// The projection layer: the latest dashboard definition built directly on the
// core. Later migrations may wrap it again (e.g. extras) without touching it.
const lastDashboard = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDirectory, file), 'utf8'))
  .filter((source) => /function public\.get_professional_dashboard\(/i.test(source) && /get_professional_dashboard_core\(/i.test(source))
  .at(-1) ?? '';
assert.match(
  lastDashboard,
  /'arrivedAt', booking\.arrived_at[\s\S]*'paymentSummary', private\.booking_payment_summary\(booking\.id\)/i,
  'the latest professional dashboard projection must keep split-payment fields',
);
// The dashboard is now a wrapper over the earlier core projection (renamed, not
// redefined), which is where the travel fee cap still comes from.
assert.match(
  lastDashboard,
  /'rating'[\s\S]*'reviewCount'[\s\S]*'recentJobs'[\s\S]*from public\.get_professional_dashboard_core\(/i,
  'the latest professional dashboard must add recent jobs and the rating on top of the core projection',
);
const dashboardCore = migrationFiles
  .map((file) => readFileSync(resolve(migrationsDirectory, file), 'utf8'))
  .filter((source) => /function public\.get_professional_dashboard\(/i.test(source) && /'travelFeeCap'/i.test(source))
  .at(-1) ?? '';
assert.match(dashboardCore, /'travelFeeCap'/i, 'the core professional dashboard projection must keep the travel fee cap');
const finalPaymentExtrasMigration = readFileSync(
  resolve(migrationsDirectory, '202609300006_final_payment_extras.sql'),
  'utf8',
);
const extrasDepositMigration = readFileSync(
  resolve(migrationsDirectory, '202609300007_extras_keep_deposit_half.sql'),
  'utf8',
);
const halfHourBookingTimesMigration = readFileSync(
  resolve(migrationsDirectory, '202609300008_half_hour_booking_times.sql'),
  'utf8',
);
const professionalExtrasMigration = readFileSync(
  resolve(migrationsDirectory, '202609300009_professional_named_extras.sql'),
  'utf8',
);
const profileLanguageMigration = readFileSync(
  resolve(migrationsDirectory, '202609300010_profile_update_preferred_language.sql'),
  'utf8',
);
const clientRewardsMigration = readFileSync(
  resolve(migrationsDirectory, '202609300011_client_rewards.sql'),
  'utf8',
);
const aroundTheClockMigration = readFileSync(
  resolve(migrationsDirectory, '202609300012_around_the_clock_availability.sql'),
  'utf8',
);
const rescheduleApprovalMigration = readFileSync(
  resolve(migrationsDirectory, '202609300013_reschedule_approval.sql'),
  'utf8',
);
const travelAnyTimeMigration = readFileSync(
  resolve(migrationsDirectory, '202609300014_travel_any_time_after_acceptance.sql'),
  'utf8',
);
const rewardGrantsMigration = readFileSync(
  resolve(migrationsDirectory, '202609300015_reward_helper_grants.sql'),
  'utf8',
);
const negativeCommissionMigration = readFileSync(
  resolve(migrationsDirectory, '202609300016_negative_commission_for_rewards.sql'),
  'utf8',
);
const dashboardWrapperMigration = readFileSync(
  resolve(migrationsDirectory, '202609230009_professional_dashboard_recent_jobs.sql'),
  'utf8',
);
assert.match(dashboardWrapperMigration, /rename to get_professional_dashboard_core/i, 'the core projection must be renamed rather than left as a duplicate definition');
assert.doesNotMatch(lastDashboard, /create (or replace )?function public\.get_professional_dashboard_core\(/i, 'the core projection must not be redefined by a later migration');
// The API calls the wrapper as service_role, which has no execute on the core:
// the wrapper must run as its owner or the dashboard request fails with 42501.
assert.match(
  lastDashboard,
  /function public\.get_professional_dashboard\([\s\S]*security definer[\s\S]*from public\.get_professional_dashboard_core\(/i,
  'the professional dashboard wrapper must be security definer so the API role can reach the private core',
);
assert.match(
  restoredProjectionsMigration,
  /update public\.bookings booking[\s\S]*set service_fee = round\(booking\.service_price \* booking\.commission_rate_bps \/ 10000\.0\)[\s\S]*status = 'requested'[\s\S]*not exists \(select 1 from public\.payment_intents/i,
  'unpaid requests quoted before the service fee must be backfilled, paid ones must not',
);

assert.match(
  payoutMethodMigration,
  /v_payout_method := private\.payout_method_from_payload\(p_payload #> '\{profile,payoutMethod\}'\)[\s\S]*payout_method = excluded\.payout_method/i,
  'registration must validate and store the professional payout method',
);
assert.match(
  payoutMethodMigration,
  /select coalesce\(payout_method, '\{\}'::jsonb\) into v_payout_method[\s\S]*paid_reference = nullif\(trim\(coalesce\(p_paid_reference, ''\)\), ''\)[\s\S]*'payout\.paid'/i,
  'payout batches must snapshot the payout method and settlement must record the reference with an audit row',
);
assert.match(
  payoutMethodMigration,
  /revoke all on function public\.update_my_professional_profile_without_payout_method\(jsonb\) from public, anon, authenticated;/i,
  'the pre-payout-method profile wrapper must not stay callable by professionals',
);

assert.match(
  finalPaymentExtrasMigration,
  /total numeric\(12, 2\) generated always as \(service_price \+ service_fee \+ travel_fee \+ extra_amount \+ extra_fee\) stored/i,
  'the booking total must include extras added at the final payment',
);
assert.match(
  finalPaymentExtrasMigration,
  /function public\.set_booking_extra_amount\([\s\S]*'balance'[\s\S]*'not_allowed'/i,
  'extras may only be added while the balance is due',
);
// The deposit is half of the base booking; extras land entirely on the balance,
// otherwise adding an extra after the deposit re-opened the deposit stage.
assert.match(
  extrasDepositMigration,
  /ceil\(\(b\.service_price \+ b\.service_fee \+ b\.travel_fee\) \* 100 \/ 2\) \/ 100/i,
  'the split deposit must be computed from the base booking without extras',
);
assert.doesNotMatch(
  extrasDepositMigration,
  /ceil\(b\.total \* 100 \/ 2\)/i,
  'the deposit must not be recomputed from the total once extras exist',
);

// The calendar and availability offer every half hour (shared/booking-time-slots),
// so the scheduled-start parser must accept any "H:MM AM" label, not a fixed list.
assert.match(
  halfHourBookingTimesMigration,
  /function private\.booking_scheduled_start\(p_date date, p_time text\)[\s\S]*'\^\(1\[0-2\]\|\[1-9\]\):\[0-5\]\[0-9\] \(AM\|PM\)\$'[\s\S]*to_timestamp\(normalized, 'HH12:MI AM'\)::time[\s\S]*at time zone 'Africa\/Addis_Ababa'/i,
  'booking times must be parsed from the half-hour label format in Addis Ababa time',
);
assert.doesNotMatch(
  halfHourBookingTimesMigration,
  /when '9:00 AM' then time '09:00'/i,
  'the fixed launch slot list must not come back',
);

// Extras are named by the professional at checkout and land on the client's
// final payment; the client can no longer set them.
assert.match(
  professionalExtrasMigration,
  /drop function if exists public\.set_booking_extra_amount\(uuid, uuid, numeric, timestamptz\)/i,
  'the client-side extras entry point must be removed',
);
assert.match(
  professionalExtrasMigration,
  /function public\.set_booking_extras_as_professional\([\s\S]*where id = p_booking_id and professional_id = p_professional_id for update[\s\S]*status not in \('in_progress', 'completed'\)[\s\S]*'fullyPaid'[\s\S]*stage = 'balance' and status = 'pending'/i,
  'professional extras must be limited to the professional\'s own unpaid checkout and void pending balance checkouts',
);
assert.match(
  professionalExtrasMigration,
  /'extraNote', booking\.extra_note/i,
  'the booking document must carry the extras description for the client',
);
assert.match(
  professionalExtrasMigration,
  /rename to get_professional_dashboard_without_extras[\s\S]*create function public\.get_professional_dashboard\([\s\S]*security definer[\s\S]*private\.professional_jobs_with_extras\(base -> 'jobs'\)[\s\S]*from public\.get_professional_dashboard_without_extras\(/i,
  'the dashboard must be wrapped (not redefined) to add extras to each job, still running as owner',
);

// Profile → Language must persist: the profile update is wrapped (not redefined)
// to write preferred_language, and the previous wrapper is locked away.
assert.match(
  profileLanguageMigration,
  /rename to update_my_professional_profile_without_language[\s\S]*not in \('am', 'om', 'en'\)[\s\S]*set preferred_language = v_language[\s\S]*revoke all on function public\.update_my_professional_profile_without_language\(jsonb\) from public, anon, authenticated/i,
  'the professional profile update must persist the validated preferred language and lock the previous wrapper',
);

// Rewards: 20% off the first booking and after every 10th completed booking,
// funded by Konjo, wrapped around the existing quote/commit/transition.
assert.match(
  clientRewardsMigration,
  /generated always as \(service_price \+ service_fee \+ travel_fee \+ extra_amount \+ extra_fee - discount_amount\) stored/i,
  'the booking total must subtract the reward',
);
assert.match(
  clientRewardsMigration,
  /where client_id = p_client_id and status <> 'cancelled'[\s\S]*'reason', 'first_booking'/i,
  'the welcome discount applies while the client has no booking that was not cancelled',
);
assert.match(
  clientRewardsMigration,
  /completed % every_bookings = 0[\s\S]*insert into public\.client_reward_coupons/i,
  'a coupon is earned on every Nth completed booking',
);
assert.match(
  clientRewardsMigration,
  /rename to quote_marketplace_booking_without_rewards[\s\S]*rename to commit_marketplace_booking_without_rewards[\s\S]*rename to transition_professional_booking_without_rewards/i,
  'quote, commit and transition must be wrapped, not redefined',
);
assert.match(
  clientRewardsMigration,
  /commission := round\(b\.service_price \* b\.commission_rate_bps \/ 10000\) \+ round\(b\.extra_amount \* b\.commission_rate_bps \/ 10000\) - b\.discount_amount/i,
  'Konjo funds the reward out of its commission so the professional is paid in full',
);
assert.match(
  clientRewardsMigration,
  /ceil\(\(b\.service_price \+ b\.service_fee \+ b\.travel_fee - b\.discount_amount\) \* 100 \/ 2\) \/ 100/i,
  'the deposit is half of the discounted base booking',
);

// Professionals take bookings at any hour: the latest availability body keeps
// the availability switch, the clock and overlap rules but no working window.
assert.match(
  aroundTheClockMigration,
  /function private\.professional_availability_api_without_active_booking\([\s\S]*generate_series\(0, 47\)[\s\S]*if slot_start <= now\(\) then[\s\S]*booking\.scheduled_start < slot_end/i,
  'around-the-clock availability must still skip past slots and overlapping bookings',
);
assert.doesNotMatch(aroundTheClockMigration, /working_start|working_end|professional_working_hours/i, 'working hours must not narrow the bookable slots');

// Moving an accepted booking stores a proposal the professional approves or
// declines; the transition is wrapped (not redefined) to add the two answers.
assert.match(
  rescheduleApprovalMigration,
  /needs_approval := booking\.status = 'accepted'[\s\S]*proposed_start = new_start[\s\S]*'requiresApproval', needs_approval/i,
  'rescheduling an accepted booking must store a proposal and flag the event for approval',
);
assert.match(
  rescheduleApprovalMigration,
  /rename to transition_professional_booking_without_reschedule_review[\s\S]*'approve-reschedule', 'decline-reschedule'[\s\S]*scheduled_start = booking\.proposed_start[\s\S]*'BookingRescheduleAccepted' else 'BookingRescheduleDeclined'/i,
  'the professional must be able to approve or decline the proposal and the client must be told',
);

// The three-hour travel guard is gone: the renamed guard wrapper only delegates now.
assert.match(
  travelAnyTimeMigration,
  /function public\.transition_professional_booking_without_rewards\([\s\S]*return public\.transition_professional_booking_without_start_guard\(/i,
  'the former guard wrapper must delegate straight to the core transition',
);
assert.doesNotMatch(travelAnyTimeMigration, /too_early|interval '3 hours'/i, 'no time guard may remain before travel');

// Checkout awards coupons from a security-invoker wrapper, so the API role needs the helper.
assert.match(rewardGrantsMigration, /grant execute on function private\.award_reward_coupon\(uuid\) to service_role/i, 'the API role must be able to award coupons at checkout');

// A Konjo-funded reward can push the commission below zero; settlement must not be blocked by it.
assert.match(negativeCommissionMigration, /drop constraint if exists professional_earnings_commission_amount_check/i, 'the non-negative commission check must be dropped for reward-funded bookings');

console.log('Supabase migration source contracts passed.');

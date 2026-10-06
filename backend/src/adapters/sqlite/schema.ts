import type { DatabaseSync } from 'node:sqlite';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export function configureSqlite(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
}

export function migrateSqliteSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('client', 'professional')),
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone_number TEXT,
      password_hash TEXT NOT NULL,
      preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'am')),
      onboarding_completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS administrators (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES administrators(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES administrators(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS service_zones (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      travel_fee INTEGER NOT NULL CHECK (travel_fee >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS service_categories (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value_integer INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (ends_at > starts_at)
    );
    CREATE TABLE IF NOT EXISTS booking_disputes (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
      resolution TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_broadcasts (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES administrators(id),
      audience TEXT NOT NULL CHECK (audience IN ('all', 'clients', 'professionals')),
      message TEXT NOT NULL,
      recipient_count INTEGER NOT NULL CHECK (recipient_count >= 0),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS safety_incidents (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      reported_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_by_role TEXT NOT NULL CHECK (reported_by_role IN ('client', 'professional')),
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      resolution TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
      CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0)
    );
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('client', 'professional')),
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts_remaining INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_identity_verifications (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      fayda_last_four TEXT NOT NULL CHECK (length(fayda_last_four) = 4),
      verified_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS professionals (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      base_zone TEXT NOT NULL,
      services_json TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      years_experience INTEGER NOT NULL DEFAULT 0,
      education_level TEXT NOT NULL DEFAULT 'secondary',
      gender TEXT NOT NULL DEFAULT 'unspecified' CHECK (gender IN ('female', 'male', 'unspecified')),
      languages_json TEXT NOT NULL DEFAULT '[]',
      language_skills_json TEXT NOT NULL DEFAULT '[]',
      featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
      hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
      suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0, 1)),
      female_only_eligible INTEGER NOT NULL DEFAULT 0 CHECK (female_only_eligible IN (0, 1)),
      rating_baseline REAL NOT NULL DEFAULT 0 CHECK (rating_baseline BETWEEN 0 AND 5),
      review_count_baseline INTEGER NOT NULL DEFAULT 0 CHECK (review_count_baseline >= 0)
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      client_request_id TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id TEXT NOT NULL REFERENCES professionals(id),
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      time TEXT NOT NULL,
      address_label TEXT NOT NULL,
      address_zone TEXT NOT NULL,
      address_detail TEXT NOT NULL,
      female_only INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      service_price INTEGER NOT NULL,
      service_fee INTEGER NOT NULL DEFAULT 0,
      travel_fee INTEGER NOT NULL,
      total INTEGER NOT NULL,
      commission_rate_bps INTEGER NOT NULL DEFAULT 1800 CHECK (commission_rate_bps BETWEEN 0 AND 10000),
      status TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      cancelled_by TEXT CHECK (cancelled_by IN ('client', 'professional') OR cancelled_by IS NULL),
      cancellation_policy TEXT CHECK (cancellation_policy IN ('full_refund', 'travel_fee_forfeit', 'client_no_show') OR cancellation_policy IS NULL),
      accept_by TEXT NOT NULL,
      assignment_version INTEGER NOT NULL DEFAULT 1 CHECK (assignment_version > 0),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_tracking (
      booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
      professional_id TEXT NOT NULL REFERENCES professionals(id),
      latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      accuracy_meters REAL,
      heading REAL,
      speed_mps REAL,
      recorded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_assignments (
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      professional_id TEXT NOT NULL REFERENCES professionals(id),
      assignment_version INTEGER NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (booking_id, assignment_version),
      UNIQUE (booking_id, professional_id)
    );
    CREATE TABLE IF NOT EXISTS payment_intents (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('telebirr', 'cbe', 'card', 'cash')),
      provider_reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'authorized', 'captured', 'cash_due', 'cash_collected', 'refunded', 'failed')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0 AND refunded_amount <= amount),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      currency TEXT NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payment_events (
      event_id TEXT PRIMARY KEY,
      payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
      entry_group TEXT NOT NULL,
      account TEXT NOT NULL CHECK (account IN ('provider_clearing', 'escrow_liability', 'professional_payable', 'platform_commission')),
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (entry_group, account)
    );
    CREATE TABLE IF NOT EXISTS client_addresses (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      zone TEXT NOT NULL,
      detail TEXT NOT NULL,
      fee INTEGER NOT NULL CHECK (fee >= 0),
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS client_favorites (
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (client_id, professional_id)
    );
    CREATE TABLE IF NOT EXISTS notification_preferences (
      client_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      booking_updates INTEGER NOT NULL DEFAULT 1 CHECK (booking_updates IN (0, 1)),
      promotions INTEGER NOT NULL DEFAULT 0 CHECK (promotions IN (0, 1)),
      chat_messages INTEGER NOT NULL DEFAULT 1 CHECK (chat_messages IN (0, 1)),
      sms_reminders INTEGER NOT NULL DEFAULT 1 CHECK (sms_reminders IN (0, 1)),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_registrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
      token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('push', 'sms')),
      template TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      next_attempt_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      outbox_id TEXT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('delivered', 'failed')),
      provider_reference TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (outbox_id, attempt)
    );
    CREATE TABLE IF NOT EXISTS domain_event_outbox (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK (schema_version > 0),
      aggregate_type TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
      occurred_at TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      causation_id TEXT,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at TEXT NOT NULL,
      locked_by TEXT,
      locked_until TEXT,
      last_error TEXT,
      processed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS booking_reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      technique_rating INTEGER NOT NULL CHECK (technique_rating BETWEEN 1 AND 5),
      professionalism_rating INTEGER NOT NULL CHECK (professionalism_rating BETWEEN 1 AND 5),
      tags_json TEXT NOT NULL DEFAULT '[]',
      review_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS professional_quality_flags (
      id TEXT PRIMARY KEY,
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      average_rating REAL NOT NULL CHECK (average_rating BETWEEN 1 AND 5),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      resolution TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS professional_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      preferred_language TEXT NOT NULL CHECK (preferred_language IN ('am', 'om', 'en')),
      legal_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      specialty TEXT NOT NULL,
      bio TEXT NOT NULL,
      years_experience INTEGER NOT NULL CHECK (years_experience BETWEEN 0 AND 60),
      education_level TEXT NOT NULL DEFAULT 'secondary',
      payout_method_json TEXT NOT NULL DEFAULT '{}',
      languages_json TEXT NOT NULL,
      language_skills_json TEXT NOT NULL DEFAULT '[]',
      base_zone TEXT NOT NULL,
      portfolio_count INTEGER NOT NULL DEFAULT 0 CHECK (portfolio_count >= 0),
      credential_added INTEGER NOT NULL DEFAULT 0 CHECK (credential_added IN (0, 1)),
      same_day_bookings INTEGER NOT NULL DEFAULT 1 CHECK (same_day_bookings IN (0, 1)),
      terms_accepted INTEGER NOT NULL CHECK (terms_accepted = 1),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected', 'suspended')),
      submitted_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS website_professional_applications (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      location TEXT NOT NULL,
      specialties TEXT NOT NULL,
      languages TEXT NOT NULL,
      years_experience INTEGER NOT NULL CHECK (years_experience BETWEEN 0 AND 60),
      introduction TEXT NOT NULL,
      files_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'contacted', 'closed')),
      submitted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS website_contact_messages (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL CHECK (topic IN ('general', 'careers', 'partnerships')),
      message TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'closed')),
      submitted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS professional_application_services (
      application_id TEXT NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 720),
      price INTEGER NOT NULL CHECK (price > 0),
      note TEXT NOT NULL DEFAULT '',
      popular INTEGER NOT NULL DEFAULT 0 CHECK (popular IN (0, 1)),
      PRIMARY KEY (application_id, id)
    );
    CREATE TABLE IF NOT EXISTS professional_application_working_days (
      application_id TEXT NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      hours TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      PRIMARY KEY (application_id, day)
    );
    CREATE TABLE IF NOT EXISTS professional_application_travel_zones (
      application_id TEXT NOT NULL REFERENCES professional_applications(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      label TEXT NOT NULL,
      active INTEGER NOT NULL CHECK (active IN (0, 1)),
      PRIMARY KEY (application_id, id)
    );
    CREATE TABLE IF NOT EXISTS professional_availability (
      professional_id TEXT PRIMARY KEY REFERENCES professionals(id) ON DELETE CASCADE,
      available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS professional_catalog_working_days (
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      hours TEXT NOT NULL DEFAULT '9:00 AM – 6:00 PM',
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      PRIMARY KEY (professional_id, day)
    );
    CREATE TABLE IF NOT EXISTS professional_catalog_zones (
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      zone TEXT NOT NULL,
      PRIMARY KEY (professional_id, zone)
    );
    CREATE TABLE IF NOT EXISTS professional_earnings (
      id TEXT PRIMARY KEY,
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      gross_amount INTEGER NOT NULL CHECK (gross_amount >= 0),
      -- A Konjo-funded client reward can make the commission negative (mirrors Postgres).
      commission_amount INTEGER NOT NULL,
      net_amount INTEGER NOT NULL CHECK (net_amount >= 0),
      payout_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payout_batches (
      id TEXT PRIMARY KEY,
      professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('queued', 'paid', 'failed')),
      amount INTEGER NOT NULL CHECK (amount >= 0),
      booking_count INTEGER NOT NULL CHECK (booking_count > 0),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      paid_at TEXT,
      payout_method_json TEXT NOT NULL DEFAULT '{}',
      paid_reference TEXT,
      paid_note TEXT,
      paid_by TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS promotions_active_idx ON promotions(active, starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS booking_disputes_status_idx ON booking_disputes(status, created_at);
    CREATE INDEX IF NOT EXISTS admin_broadcasts_created_idx ON admin_broadcasts(created_at);
    CREATE INDEX IF NOT EXISTS safety_incidents_status_idx ON safety_incidents(status, created_at);
    CREATE INDEX IF NOT EXISTS otp_challenges_phone_created_idx ON otp_challenges(phone_number, created_at);
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS bookings_client_id_idx ON bookings(client_id);
    CREATE INDEX IF NOT EXISTS device_registrations_user_idx ON device_registrations(user_id, active);
    CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS domain_event_outbox_due_idx ON domain_event_outbox(status, available_at, locked_until);
    CREATE INDEX IF NOT EXISTS payment_intents_client_idx ON payment_intents(client_id, created_at);
    CREATE INDEX IF NOT EXISTS ledger_entries_booking_idx ON ledger_entries(booking_id, created_at);
    CREATE INDEX IF NOT EXISTS client_addresses_client_idx ON client_addresses(client_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS client_addresses_one_default_idx ON client_addresses(client_id) WHERE is_default = 1;
    CREATE INDEX IF NOT EXISTS client_favorites_client_idx ON client_favorites(client_id, created_at);
    CREATE INDEX IF NOT EXISTS booking_reviews_professional_idx ON booking_reviews(professional_id, created_at);
    CREATE INDEX IF NOT EXISTS professional_quality_flags_status_idx ON professional_quality_flags(status, created_at);
    CREATE INDEX IF NOT EXISTS professional_applications_status_idx ON professional_applications(status, submitted_at);
    CREATE INDEX IF NOT EXISTS website_professional_applications_status_idx ON website_professional_applications(status, submitted_at);
    CREATE INDEX IF NOT EXISTS website_contact_messages_status_idx ON website_contact_messages(status, submitted_at);
    CREATE INDEX IF NOT EXISTS professional_earnings_professional_idx ON professional_earnings(professional_id, created_at);
    CREATE INDEX IF NOT EXISTS payout_batches_professional_idx ON payout_batches(professional_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_role_idx ON users(phone_number, role) WHERE phone_number IS NOT NULL;
  `);

  const professionalApplicationsSchema = database.prepare(`
    SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'professional_applications'
  `).get() as unknown as { sql: string } | undefined;
  if (professionalApplicationsSchema && !professionalApplicationsSchema.sql.includes("'rejected'")) {
    database.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE professional_applications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        preferred_language TEXT NOT NULL CHECK (preferred_language IN ('am', 'om', 'en')),
        legal_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        specialty TEXT NOT NULL,
        bio TEXT NOT NULL,
        years_experience INTEGER NOT NULL CHECK (years_experience BETWEEN 0 AND 60),
        languages_json TEXT NOT NULL,
        base_zone TEXT NOT NULL,
        portfolio_count INTEGER NOT NULL DEFAULT 0 CHECK (portfolio_count >= 0),
        credential_added INTEGER NOT NULL DEFAULT 0 CHECK (credential_added IN (0, 1)),
        same_day_bookings INTEGER NOT NULL DEFAULT 1 CHECK (same_day_bookings IN (0, 1)),
        terms_accepted INTEGER NOT NULL CHECK (terms_accepted = 1),
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected', 'suspended')),
        submitted_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO professional_applications_new SELECT * FROM professional_applications;
      DROP TABLE professional_applications;
      ALTER TABLE professional_applications_new RENAME TO professional_applications;
      CREATE INDEX professional_applications_status_idx ON professional_applications(status, submitted_at);
      PRAGMA foreign_keys = ON;
    `);
  }

  const userColumns = database.prepare('PRAGMA table_info(users)').all() as unknown as Array<{ name: string }>;
  const userColumnNames = new Set(userColumns.map((column) => column.name));
  if (!userColumnNames.has('preferred_language')) {
    database.exec("ALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en'");
  }
  if (!userColumnNames.has('onboarding_completed_at')) {
    database.exec('ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT');
  }

  const trackingColumnNames = new Set((database.prepare('PRAGMA table_info(booking_tracking)').all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (!trackingColumnNames.has('area_label')) {
    database.exec('ALTER TABLE booking_tracking ADD COLUMN area_label TEXT');
  }
  const bookingColumns = database.prepare('PRAGMA table_info(bookings)').all() as unknown as Array<{ name: string }>;
  const bookingColumnNames = new Set(bookingColumns.map((column) => column.name));
  if (!bookingColumnNames.has('latitude')) {
    database.exec('ALTER TABLE bookings ADD COLUMN latitude REAL');
  }
  if (!bookingColumnNames.has('longitude')) {
    database.exec('ALTER TABLE bookings ADD COLUMN longitude REAL');
  }
  if (!bookingColumnNames.has('cancellation_reason')) {
    database.exec('ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT');
  }
  if (!bookingColumnNames.has('client_archived_at')) {
    database.exec('ALTER TABLE bookings ADD COLUMN client_archived_at TEXT');
  }
  const addressColumnNames = new Set((database.prepare('PRAGMA table_info(client_addresses)').all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (addressColumnNames.size && !addressColumnNames.has('latitude')) {
    database.exec('ALTER TABLE client_addresses ADD COLUMN latitude REAL');
    database.exec('ALTER TABLE client_addresses ADD COLUMN longitude REAL');
  }
  const paymentColumnNames = new Set((database.prepare('PRAGMA table_info(payment_intents)').all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (paymentColumnNames.size && !paymentColumnNames.has('checkout_url')) {
    database.exec('ALTER TABLE payment_intents ADD COLUMN checkout_url TEXT');
  }
  const outboxColumnNames = new Set((database.prepare('PRAGMA table_info(notification_outbox)').all() as unknown as Array<{ name: string }>).map((column) => column.name));
  if (outboxColumnNames.size && !outboxColumnNames.has('read_at')) {
    database.exec('ALTER TABLE notification_outbox ADD COLUMN read_at TEXT');
  }
  if (!bookingColumnNames.has('female_only')) {
    database.exec('ALTER TABLE bookings ADD COLUMN female_only INTEGER NOT NULL DEFAULT 0');
  }
  if (!bookingColumnNames.has('payment_method')) {
    database.exec("ALTER TABLE bookings ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'");
  }
  if (!bookingColumnNames.has('started_at')) {
    database.exec('ALTER TABLE bookings ADD COLUMN started_at TEXT');
  }
  if (!bookingColumnNames.has('completed_at')) {
    database.exec('ALTER TABLE bookings ADD COLUMN completed_at TEXT');
  }
  if (!bookingColumnNames.has('cancelled_by')) {
    database.exec('ALTER TABLE bookings ADD COLUMN cancelled_by TEXT');
  }
  if (!bookingColumnNames.has('accept_by')) {
    database.exec("ALTER TABLE bookings ADD COLUMN accept_by TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
  }
  if (!bookingColumnNames.has('assignment_version')) {
    database.exec('ALTER TABLE bookings ADD COLUMN assignment_version INTEGER NOT NULL DEFAULT 1');
  }
  if (!bookingColumnNames.has('client_request_id')) {
    database.exec('ALTER TABLE bookings ADD COLUMN client_request_id TEXT');
  }
  if (!bookingColumnNames.has('cancellation_policy')) {
    database.exec('ALTER TABLE bookings ADD COLUMN cancellation_policy TEXT');
  }
  if (!bookingColumnNames.has('commission_rate_bps')) {
    database.exec('ALTER TABLE bookings ADD COLUMN commission_rate_bps INTEGER NOT NULL DEFAULT 1800');
  }
  if (!bookingColumnNames.has('version')) {
    database.exec('ALTER TABLE bookings ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS bookings_accept_by_idx ON bookings(status, accept_by);
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_client_request_idx
    ON bookings(client_id, client_request_id) WHERE client_request_id IS NOT NULL
  `);

  const paymentColumns = database.prepare('PRAGMA table_info(payment_intents)').all() as unknown as Array<{ name: string }>;
  if (!paymentColumns.some((column) => column.name === 'refunded_amount')) {
    database.exec('ALTER TABLE payment_intents ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0');
  }
  if (!paymentColumns.some((column) => column.name === 'version')) {
    database.exec('ALTER TABLE payment_intents ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }

  if (!paymentColumns.some((column) => column.name === 'stage')) {
    // Rebuild only this table to replace its old one-payment-per-booking constraint.
    // Child foreign keys keep their original target; all existing rows are retained.
    database.exec('PRAGMA foreign_keys = OFF');
    try {
      new SqliteUnitOfWork(database).run(() => {
        const definition = (database.prepare("SELECT sql FROM sqlite_master WHERE name = 'payment_intents'").get() as { sql: string }).sql;
        database.exec(definition.replace('payment_intents', 'payment_intents_split')
          .replace('booking_id TEXT NOT NULL UNIQUE', 'booking_id TEXT NOT NULL'));
        database.exec(`INSERT INTO payment_intents_split SELECT * FROM payment_intents;
          DROP TABLE payment_intents;
          ALTER TABLE payment_intents_split RENAME TO payment_intents;
          ALTER TABLE payment_intents ADD COLUMN stage TEXT NOT NULL DEFAULT 'full' CHECK (stage IN ('full', 'deposit', 'balance'));
          ALTER TABLE payment_intents ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0);
          CREATE UNIQUE INDEX payment_installment_attempt ON payment_intents(booking_id, stage, attempt);
          CREATE UNIQUE INDEX payment_installment_active ON payment_intents(booking_id, stage) WHERE status <> 'failed';
          CREATE INDEX payment_intents_client_idx ON payment_intents(client_id, created_at);`);
        if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Payment migration violated a foreign key.');
      });
    } finally {
      database.exec('PRAGMA foreign_keys = ON');
    }
  }
  const lifecycleColumns = new Set((database.prepare('PRAGMA table_info(bookings)').all() as { name: string }[]).map((column) => column.name));
  const notificationColumns = new Set((database.prepare('PRAGMA table_info(notification_outbox)').all() as { name: string }[]).map((column) => column.name));
  for (const name of ['push_ticket', 'push_ticket_started_at', 'push_destination']) {
    if (!notificationColumns.has(name)) database.exec(`ALTER TABLE notification_outbox ADD COLUMN ${name} TEXT`);
  }
  for (const name of ['accepted_at', 'travel_started_at', 'arrived_at']) {
    if (!lifecycleColumns.has(name)) database.exec(`ALTER TABLE bookings ADD COLUMN ${name} TEXT`);
  }
  if (!lifecycleColumns.has('payment_plan')) {
    database.exec("ALTER TABLE bookings ADD COLUMN payment_plan TEXT NOT NULL DEFAULT 'full' CHECK (payment_plan IN ('full', 'split'))");
  }
  if (!lifecycleColumns.has('service_fee')) {
    database.exec('ALTER TABLE bookings ADD COLUMN service_fee INTEGER NOT NULL DEFAULT 0');
  }
  if (!lifecycleColumns.has('extra_amount')) {
    database.exec('ALTER TABLE bookings ADD COLUMN extra_amount INTEGER NOT NULL DEFAULT 0');
    database.exec('ALTER TABLE bookings ADD COLUMN extra_fee INTEGER NOT NULL DEFAULT 0');
  }
  if (!lifecycleColumns.has('extra_note')) {
    database.exec('ALTER TABLE bookings ADD COLUMN extra_note TEXT');
  }
  if (!lifecycleColumns.has('proposed_date_iso')) {
    database.exec('ALTER TABLE bookings ADD COLUMN proposed_date_iso TEXT');
    database.exec('ALTER TABLE bookings ADD COLUMN proposed_time TEXT');
  }
  if (!lifecycleColumns.has('discount_amount')) {
    database.exec('ALTER TABLE bookings ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0');
    database.exec('ALTER TABLE bookings ADD COLUMN discount_rate_bps INTEGER NOT NULL DEFAULT 0');
    database.exec('ALTER TABLE bookings ADD COLUMN discount_reason TEXT');
  }
  database.exec(`CREATE TABLE IF NOT EXISTS client_reward_coupons (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    milestone INTEGER NOT NULL,
    rate_bps INTEGER NOT NULL,
    earned_at TEXT NOT NULL,
    redeemed_booking_id TEXT,
    redeemed_at TEXT,
    UNIQUE (client_id, milestone)
  )`);
  database.exec(`CREATE TRIGGER IF NOT EXISTS clear_finished_booking_tracking AFTER UPDATE OF status ON bookings
    WHEN NEW.status IN ('completed', 'cancelled') BEGIN DELETE FROM booking_tracking WHERE booking_id = NEW.id; END;`);

  const professionalColumns = database.prepare('PRAGMA table_info(professionals)').all() as unknown as Array<{ name: string }>;
  const professionalColumnNames = new Set(professionalColumns.map((column) => column.name));
  if (!professionalColumnNames.has('category')) database.exec("ALTER TABLE professionals ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  if (!professionalColumnNames.has('bio')) database.exec("ALTER TABLE professionals ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
  if (!professionalColumnNames.has('years_experience')) database.exec('ALTER TABLE professionals ADD COLUMN years_experience INTEGER NOT NULL DEFAULT 0');
  if (!professionalColumnNames.has('education_level')) database.exec("ALTER TABLE professionals ADD COLUMN education_level TEXT NOT NULL DEFAULT 'secondary'");
  if (!professionalColumnNames.has('gender')) database.exec("ALTER TABLE professionals ADD COLUMN gender TEXT NOT NULL DEFAULT 'unspecified'");
  if (!professionalColumnNames.has('languages_json')) database.exec("ALTER TABLE professionals ADD COLUMN languages_json TEXT NOT NULL DEFAULT '[]'");
  if (!professionalColumnNames.has('language_skills_json')) database.exec("ALTER TABLE professionals ADD COLUMN language_skills_json TEXT NOT NULL DEFAULT '[]'");
  if (!professionalColumnNames.has('featured')) database.exec('ALTER TABLE professionals ADD COLUMN featured INTEGER NOT NULL DEFAULT 0');
  if (!professionalColumnNames.has('hidden')) database.exec('ALTER TABLE professionals ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  if (!professionalColumnNames.has('suspended')) database.exec('ALTER TABLE professionals ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0');
  if (!professionalColumnNames.has('female_only_eligible')) database.exec('ALTER TABLE professionals ADD COLUMN female_only_eligible INTEGER NOT NULL DEFAULT 0');
  if (!professionalColumnNames.has('rating_baseline')) database.exec('ALTER TABLE professionals ADD COLUMN rating_baseline REAL NOT NULL DEFAULT 0');
  if (!professionalColumnNames.has('review_count_baseline')) database.exec('ALTER TABLE professionals ADD COLUMN review_count_baseline INTEGER NOT NULL DEFAULT 0');

  const catalogWorkingDayColumns = database.prepare('PRAGMA table_info(professional_catalog_working_days)').all() as unknown as Array<{ name: string }>;
  if (!catalogWorkingDayColumns.some((column) => column.name === 'hours')) {
    database.exec("ALTER TABLE professional_catalog_working_days ADD COLUMN hours TEXT NOT NULL DEFAULT '9:00 AM – 6:00 PM'");
  }

  const applicationColumns = database.prepare('PRAGMA table_info(professional_applications)').all() as unknown as Array<{ name: string }>;
  const applicationColumnNames = new Set(applicationColumns.map((column) => column.name));
  if (!applicationColumnNames.has('education_level')) database.exec("ALTER TABLE professional_applications ADD COLUMN education_level TEXT NOT NULL DEFAULT 'secondary'");
  if (!applicationColumnNames.has('gender')) database.exec("ALTER TABLE professional_applications ADD COLUMN gender TEXT NOT NULL DEFAULT 'unspecified' CHECK (gender IN ('female', 'male', 'unspecified'))");
  if (!applicationColumnNames.has('language_skills_json')) database.exec("ALTER TABLE professional_applications ADD COLUMN language_skills_json TEXT NOT NULL DEFAULT '[]'");
  if (!applicationColumnNames.has('payout_method_json')) database.exec("ALTER TABLE professional_applications ADD COLUMN payout_method_json TEXT NOT NULL DEFAULT '{}'");
  database.exec(`
    UPDATE professional_applications
    SET language_skills_json = (
      SELECT json_group_array(json_object('language', value, 'proficiency', 'conversational'))
      FROM json_each(professional_applications.languages_json)
    )
    WHERE language_skills_json = '[]' AND languages_json <> '[]';
    UPDATE professionals
    SET language_skills_json = (
      SELECT json_group_array(json_object('language', value, 'proficiency', 'conversational'))
      FROM json_each(professionals.languages_json)
    )
    WHERE language_skills_json = '[]' AND languages_json <> '[]';
  `);

  const earningsColumns = database.prepare('PRAGMA table_info(professional_earnings)').all() as unknown as Array<{ name: string }>;
  if (!earningsColumns.some((column) => column.name === 'payout_id')) {
    database.exec('ALTER TABLE professional_earnings ADD COLUMN payout_id TEXT');
  }

  const payoutColumns = database.prepare('PRAGMA table_info(payout_batches)').all() as unknown as Array<{ name: string }>;
  if (!payoutColumns.some((column) => column.name === 'version')) {
    database.exec('ALTER TABLE payout_batches ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  }
  if (!payoutColumns.some((column) => column.name === 'payout_method_json')) {
    database.exec("ALTER TABLE payout_batches ADD COLUMN payout_method_json TEXT NOT NULL DEFAULT '{}'");
  }
  for (const column of ['paid_reference', 'paid_note', 'paid_by']) {
    if (!payoutColumns.some((existing) => existing.name === column)) database.exec(`ALTER TABLE payout_batches ADD COLUMN ${column} TEXT`);
  }

  database.exec(`
    INSERT OR IGNORE INTO professional_catalog_working_days (professional_id, day, hours, enabled)
    SELECT applications.user_id, days.day, days.hours, days.enabled
    FROM professional_application_working_days days
    JOIN professional_applications applications ON applications.id = days.application_id
    WHERE applications.status = 'approved';
    INSERT OR IGNORE INTO professional_catalog_zones (professional_id, zone)
    SELECT applications.user_id, zones.label
    FROM professional_application_travel_zones zones
    JOIN professional_applications applications ON applications.id = zones.application_id
    WHERE applications.status = 'approved' AND zones.active = 1;
  `);
}

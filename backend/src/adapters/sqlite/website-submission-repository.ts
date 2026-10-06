import type { DatabaseSync } from 'node:sqlite';

import type { StoredApplicationFile } from '../../uploads.ts';

export interface WebsiteProfessionalApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  specialties: string;
  languages: string;
  yearsExperience: number;
  introduction: string;
  files: ReadonlyArray<StoredApplicationFile>;
  submittedAt: string;
}

export interface WebsiteContactMessage {
  id: string;
  fullName: string;
  email: string;
  topic: 'general' | 'careers' | 'partnerships';
  message: string;
  recipient: string;
  submittedAt: string;
}

export class SqliteWebsiteSubmissionRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  createProfessionalApplication(application: WebsiteProfessionalApplication): void {
    this.database.prepare(`
      INSERT INTO website_professional_applications (
        id, full_name, email, phone, location, specialties, languages,
        years_experience, introduction, files_json, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
    `).run(
      application.id,
      application.fullName,
      application.email,
      application.phone,
      application.location,
      application.specialties,
      application.languages,
      application.yearsExperience,
      application.introduction,
      JSON.stringify(application.files),
      application.submittedAt,
    );
  }

  createContactMessage(message: WebsiteContactMessage): void {
    this.database.prepare(`
      INSERT INTO website_contact_messages (
        id, full_name, email, topic, message, recipient, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'new', ?)
    `).run(
      message.id,
      message.fullName,
      message.email,
      message.topic,
      message.message,
      message.recipient,
      message.submittedAt,
    );
  }
}

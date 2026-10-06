import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type { ApiDomainEventDeadLetter } from '../../../shared/api-contracts.ts';
import type { NotificationDeliveryJob } from '../application/contracts.ts';
import type {
  BackgroundJobStore,
  DomainEventRecoveryStore,
  DomainEventStore,
  NotificationCommandStore,
} from '../application/ports.ts';
import type { DomainEventEnvelope } from '../domain/events.ts';

type JsonRecord = Record<string, unknown>;

export class SupabaseEventWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseEventWorkerError';
  }
}

export class SupabaseEventWorkerRepository
implements DomainEventStore, DomainEventRecoveryStore, NotificationCommandStore, BackgroundJobStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async enqueueNotification(
    userId: string,
    idempotencyKey: string,
    channel: 'push' | 'sms',
    template: string,
    payload: Record<string, unknown>,
    now = new Date().toISOString(),
  ): Promise<boolean> {
    return await this.booleanRpc('enqueue_notification', {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_channel: channel,
      p_template: template,
      p_payload: payload,
      p_now: now,
    });
  }

  async claimDomainEvents(input: {
    workerId: string;
    now: string;
    lockedUntil: string;
    limit: number;
  }): Promise<ReadonlyArray<DomainEventEnvelope>> {
    return await this.arrayRpc<DomainEventEnvelope>('claim_domain_events', {
      p_worker_id: input.workerId,
      p_now: input.now,
      p_locked_until: input.lockedUntil,
      p_limit: input.limit,
    });
  }

  async markDomainEventProcessed(eventId: string, workerId: string, processedAt: string): Promise<boolean> {
    return await this.booleanRpc('mark_domain_event_processed', {
      p_event_id: eventId,
      p_worker_id: workerId,
      p_processed_at: processedAt,
    });
  }

  async recordDomainEventFailure(input: {
    eventId: string;
    workerId: string;
    failedAt: string;
    availableAt: string;
    errorMessage: string;
    terminal: boolean;
  }): Promise<boolean> {
    return await this.booleanRpc('record_domain_event_failure', {
      p_event_id: input.eventId,
      p_worker_id: input.workerId,
      p_failed_at: input.failedAt,
      p_available_at: input.availableAt,
      p_error_message: input.errorMessage,
      p_terminal: input.terminal,
    });
  }

  async listFailedDomainEvents(limit: number): Promise<ReadonlyArray<ApiDomainEventDeadLetter>> {
    return await this.arrayRpc<ApiDomainEventDeadLetter>('list_failed_domain_events', { p_limit: limit });
  }

  async replayFailedDomainEvent(
    eventId: string,
    adminId: string,
    requestedAt: string,
  ): Promise<'replayed' | 'not_found' | 'not_failed'> {
    return await this.rpc('replay_failed_domain_event', {
      p_event_id: eventId,
      p_admin_id: adminId,
      p_requested_at: requestedAt,
    }) as 'replayed' | 'not_found' | 'not_failed';
  }

  async reassignOverdueBookings(now: Date): Promise<ReadonlyArray<{ bookingId: string; professionalId: string }>> {
    return await this.arrayRpc('reassign_overdue_bookings', { p_now: now.toISOString() });
  }

  async enqueueDueBookingReminders(now: Date): Promise<number> {
    const result = await this.rpc('enqueue_due_booking_reminders', { p_now: now.toISOString() });
    if (typeof result !== 'number') throw new SupabaseEventWorkerError('Supabase returned an invalid reminder count.');
    return result;
  }

  async listDueNotificationJobs(now: string, limit = 25): Promise<ReadonlyArray<NotificationDeliveryJob>> {
    return await this.arrayRpc<NotificationDeliveryJob>('claim_due_notification_jobs', {
      p_now: now,
      p_limit: limit,
    });
  }

  async recordNotificationDelivery(
    job: NotificationDeliveryJob,
    result: { delivered: boolean; pending?: boolean; providerReference?: string; errorMessage?: string },
    recordedAt: Date,
  ): Promise<void> {
    await this.rpc('record_notification_delivery', {
      p_job: job,
      p_result: result,
      p_recorded_at: recordedAt.toISOString(),
    });
  }

  private async arrayRpc<T>(name: string, body: JsonRecord): Promise<ReadonlyArray<T>> {
    const result = await this.rpc(name, body);
    if (!Array.isArray(result)) throw new SupabaseEventWorkerError(`Supabase returned an invalid ${name} result.`);
    return result as T[];
  }

  private async booleanRpc(name: string, body: JsonRecord): Promise<boolean> {
    const result = await this.rpc(name, body);
    if (typeof result !== 'boolean') throw new SupabaseEventWorkerError(`Supabase returned an invalid ${name} result.`);
    return result;
  }

  private async rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseEventWorkerError('Supabase event workers are unavailable.');
    }
    if (!response.ok) throw new SupabaseEventWorkerError('Supabase rejected the worker operation.');
    if (response.status === 204) return undefined;
    return response.json();
  }
}

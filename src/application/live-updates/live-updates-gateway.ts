export interface LiveUpdatesGateway {
  subscribe(table: 'notification_outbox' | 'booking_tracking' | 'bookings' | 'payment_intents' | 'payout_batches' | 'professional_earnings', column: string, id: string | null, refresh: () => void): () => void;
  markNotificationsRead(ids: readonly string[]): Promise<void>;
}

import type {
  ApiBooking,
  ApiClientData,
  ApiNotificationPreferences,
  ApiPaymentIntent,
} from '../../../shared/api-contracts';
import type { AuthSession } from '../auth/session-controller';
import type {
  BookingRatingInput,
  ClientBooking,
  ClientBookingStatus,
  NewClientBooking,
  NotificationPreferenceKey,
} from './client-data-contracts';

export interface ClientBookingGateway {
  list(accessToken: string): Promise<readonly ApiBooking[]>;
  cancel(bookingId: string, accessToken?: string): Promise<void>;
  archive(bookingId: string, accessToken?: string): Promise<void>;
  reschedule(
    bookingId: string,
    dateIso: string,
    time: string,
    accessToken?: string,
  ): Promise<void>;
  submitReview(
    bookingId: string,
    input: BookingRatingInput,
    accessToken?: string,
  ): Promise<void>;
  initiatePayment(bookingId: string, accessToken?: string): Promise<ApiPaymentIntent>;
  verifyPayment(bookingId: string, accessToken?: string): Promise<{ paymentIntent: ApiPaymentIntent; status: 'captured' | 'failed' | 'pending'; verified: boolean } | null>;
}

export interface ClientPreferencesGateway {
  load(accessToken: string): Promise<ApiClientData>;
  setFavorite(
    accessToken: string,
    professionalId: string,
    favorite: boolean,
  ): Promise<void>;
  updateNotificationPreferences(
    accessToken: string,
    preferences: ApiNotificationPreferences,
  ): Promise<ApiNotificationPreferences>;
}

export interface ClientDataScheduler {
  every(milliseconds: number, task: () => void): () => void;
}

export interface ClientDataRuntime {
  dateLabel(dateIso: string): string;
}

export interface ClientDataControllerLogger {
  error(message: string, error: unknown): void;
  /** Expected, self-healing conditions such as a slow API; never a red error box. */
  warn?(message: string, error: unknown): void;
}

export interface ClientDataSnapshot {
  bookings: readonly ClientBooking[];
  favouriteIds: ReadonlySet<string>;
  notificationPreferences: Readonly<ApiNotificationPreferences>;
}

export interface ClientDataControllerOptions {
  pollingIntervalMs: number;
}

type ClientDataListener = () => void;

const RATE_LIMIT_PAUSE_MS = 60_000;

function isRateLimited(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 429;
}

const TRANSIENT_PAUSE_MS = 20_000;

/** Gateway timeouts, upstream outages and dropped connections: the next poll will try again. */
function isTransientOutage(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, name } = error as { status?: unknown; name?: unknown };
  return status === 0 || status === 502 || status === 503 || status === 504 || name === 'TimeoutError' || name === 'AbortError';
}

const defaultNotificationPreferences: ApiNotificationPreferences = {
  bookingUpdates: true,
  promotions: false,
  smsReminders: true,
};

const silentLogger: ClientDataControllerLogger = {
  error() {},
};

export class ClientDataController {
  private snapshot: ClientDataSnapshot = {
    bookings: [],
    favouriteIds: new Set(),
    notificationPreferences: defaultNotificationPreferences,
  };
  private readonly listeners = new Set<ClientDataListener>();
  private readonly bookings: ClientBookingGateway;
  private readonly preferences: ClientPreferencesGateway;
  private readonly scheduler: ClientDataScheduler;
  private readonly runtime: ClientDataRuntime;
  private readonly logger: ClientDataControllerLogger;
  private readonly options: ClientDataControllerOptions;
  private session: AuthSession | null = null;
  private identity = '';
  private loadVersion = 0;
  private bookingMutationVersion = 0;
  private favoriteMutationVersion = 0;
  private notificationMutationVersion = 0;
  private cancelPolling: (() => void) | null = null;
  private poll: { loadVersion: number; promise: Promise<void> } | null = null;
  /** When the API answers 429 we pause polling until this time instead of hammering it. */
  private pollPausedUntil = 0;
  private bookingMutationQueue: Promise<void> = Promise.resolve();
  private preferenceMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    bookings: ClientBookingGateway,
    preferences: ClientPreferencesGateway,
    scheduler: ClientDataScheduler,
    runtime: ClientDataRuntime,
    options: ClientDataControllerOptions,
    logger: ClientDataControllerLogger = silentLogger,
  ) {
    this.bookings = bookings;
    this.preferences = preferences;
    this.scheduler = scheduler;
    this.runtime = runtime;
    this.options = options;
    this.logger = logger;
  }

  readonly getSnapshot = (): ClientDataSnapshot => this.snapshot;

  readonly subscribe = (listener: ClientDataListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async setSession(session: AuthSession | null): Promise<void> {
    this.stopPolling();
    const identity = session
      ? `${session.source}:${session.userId}:${session.accessToken ?? ''}`
      : 'anonymous';
    this.identity = identity;
    this.session = session;
    const loadVersion = ++this.loadVersion;
    this.bookingMutationVersion = 0;
    this.favoriteMutationVersion = 0;
    this.notificationMutationVersion = 0;
    this.publish({
      bookings: [],
      favouriteIds: new Set(),
      notificationPreferences: defaultNotificationPreferences,
    });

    if (session?.source !== 'api' || !session.accessToken) return;
    const accessToken = session.accessToken;
    const bookingMutationVersion = this.bookingMutationVersion;
    const favoriteMutationVersion = this.favoriteMutationVersion;
    const notificationMutationVersion = this.notificationMutationVersion;
    this.startPolling(accessToken, loadVersion);

    try {
      const [bookings, clientData] = await Promise.all([
        this.bookings.list(accessToken),
        this.preferences.load(accessToken),
      ]);
      if (!this.isCurrent(loadVersion, identity)) return;
      this.publish({
        bookings: bookingMutationVersion === this.bookingMutationVersion
          ? bookings.map((booking) => this.bookingFromApi(booking))
          : this.snapshot.bookings,
        favouriteIds: favoriteMutationVersion === this.favoriteMutationVersion
          ? new Set(clientData.favouriteIds)
          : this.snapshot.favouriteIds,
        notificationPreferences: notificationMutationVersion === this.notificationMutationVersion
          ? clientData.notificationPreferences
          : this.snapshot.notificationPreferences,
      });
    } catch (error) {
      this.logger.error('Unable to restore client data.', error);
    }
  }

  deactivate(): void {
    this.stopPolling();
    this.identity = '';
    this.session = null;
    this.loadVersion += 1;
  }

  addBooking(booking: NewClientBooking): void {
    this.bookingMutationVersion += 1;
    const clientBooking: ClientBooking = {
      id: booking.receipt.bookingId,
      professionalId: booking.professionalId,
      serviceId: booking.serviceId,
      serviceName: booking.serviceName,
      dateIso: booking.dateIso,
      dateLabel: booking.dateLabel,
      time: booking.time,
      total: booking.total,
      travelFee: booking.receipt.travelFee,
      discountAmount: booking.receipt.discountAmount ?? 0,
      discountReason: booking.receipt.discountReason ?? null,
      address: booking.address,
      paymentMethod: booking.paymentMethod,
      status: 'requested',
      cancellationPolicy: null,
      rated: false,
      createdAt: booking.receipt.createdAt,
    };
    this.publish({
      ...this.snapshot,
      bookings: [
        clientBooking,
        ...this.snapshot.bookings.filter((item) => item.id !== clientBooking.id),
      ],
    });
  }

  cancelBooking(bookingId: string): Promise<void> {
    return this.enqueueBookingMutation(async () => {
      const identity = this.identity;
      await this.bookings.cancel(bookingId, this.session?.accessToken);
      if (identity !== this.identity) return;
      this.bookingMutationVersion += 1;
      this.updateBooking(bookingId, (booking) => ({ ...booking, status: 'cancelled' }));
    });
  }

  /** Removes a finished booking from the client's history (the record itself is kept server-side). */
  archiveBooking(bookingId: string): Promise<void> {
    return this.enqueueBookingMutation(async () => {
      const identity = this.identity;
      await this.bookings.archive(bookingId, this.session?.accessToken);
      if (identity !== this.identity) return;
      this.bookingMutationVersion += 1;
      this.publish({ ...this.snapshot, bookings: this.snapshot.bookings.filter((booking) => booking.id !== bookingId) });
    });
  }

  rescheduleBooking(bookingId: string, dateIso: string, time: string): Promise<void> {
    return this.enqueueBookingMutation(async () => {
      const identity = this.identity;
      await this.bookings.reschedule(bookingId, dateIso, time, this.session?.accessToken);
      if (identity !== this.identity) return;
      this.bookingMutationVersion += 1;
      // An accepted booking keeps its time until the professional approves the new one.
      this.updateBooking(bookingId, (booking) => (booking.status === 'accepted'
        ? { ...booking, proposedDateIso: dateIso, proposedTime: time }
        : { ...booking, dateIso, dateLabel: this.runtime.dateLabel(dateIso), time, proposedDateIso: null, proposedTime: null }));
    });
  }

  updateBookingStatus(bookingId: string, status: ClientBookingStatus): void {
    this.bookingMutationVersion += 1;
    this.updateBooking(bookingId, (booking) => ({ ...booking, status }));
  }

  rateBooking(bookingId: string, input: BookingRatingInput): Promise<void> {
    return this.enqueueBookingMutation(async () => {
      const identity = this.identity;
      await this.bookings.submitReview(bookingId, input, this.session?.accessToken);
      if (identity !== this.identity) return;
      this.bookingMutationVersion += 1;
      const rating = (input.techniqueRating + input.professionalismRating) / 2;
      this.updateBooking(bookingId, (booking) => ({ ...booking, rated: true, rating }));
    });
  }

  initiatePayment(bookingId: string): Promise<ApiPaymentIntent> {
    return this.enqueueBookingMutation(async () => {
      const identity = this.identity;
      const payment = await this.bookings.initiatePayment(bookingId, this.session?.accessToken);
      if (identity === this.identity) {
        this.bookingMutationVersion += 1;
        this.updateBooking(bookingId, (booking) => ({
          ...booking,
          paymentIntentId: payment.id,
          paymentStatus: payment.status,
          checkoutUrl: payment.checkoutUrl ?? null,
        }));
      }
      return payment;
    });
  }

  /**
   * After the hosted checkout closes: settle the pending payment with the
   * provider's verdict and refresh, so the client sees "paid" without waiting
   * for the webhook. Resolves to the payment status, or null when nothing was pending.
   */
  verifyPayment(bookingId: string): Promise<'captured' | 'failed' | 'pending' | null> {
    return this.enqueueBookingMutation(async () => {
      const identity = this.identity;
      const verification = await this.bookings.verifyPayment(bookingId, this.session?.accessToken);
      if (!verification || identity !== this.identity) return verification?.status ?? null;
      this.bookingMutationVersion += 1;
      this.updateBooking(bookingId, (booking) => ({
        ...booking,
        paymentIntentId: verification.paymentIntent.id,
        paymentStatus: verification.paymentIntent.status,
        checkoutUrl: verification.paymentIntent.checkoutUrl ?? null,
      }));
      if (verification.status !== 'pending') void this.refresh();
      return verification.status;
    });
  }

  toggleFavourite(professionalId: string): Promise<void> {
    return this.enqueuePreferenceMutation(async () => {
      const identity = this.identity;
      const favorite = !this.snapshot.favouriteIds.has(professionalId);
      try {
        if (this.session?.source === 'api' && this.session.accessToken) {
          await this.preferences.setFavorite(
            this.session.accessToken,
            professionalId,
            favorite,
          );
        }
        if (identity !== this.identity) return;
        this.favoriteMutationVersion += 1;
        const favouriteIds = new Set(this.snapshot.favouriteIds);
        if (favorite) favouriteIds.add(professionalId);
        else favouriteIds.delete(professionalId);
        this.publish({ ...this.snapshot, favouriteIds });
      } catch (error) {
        this.logger.error('Unable to update favourite.', error);
      }
    });
  }

  toggleNotificationPreference(key: NotificationPreferenceKey): Promise<void> {
    return this.enqueuePreferenceMutation(async () => {
      const identity = this.identity;
      const next = {
        ...this.snapshot.notificationPreferences,
        [key]: !this.snapshot.notificationPreferences[key],
      };
      try {
        const persisted = this.session?.source === 'api' && this.session.accessToken
          ? await this.preferences.updateNotificationPreferences(this.session.accessToken, next)
          : next;
        if (identity !== this.identity) return;
        this.notificationMutationVersion += 1;
        this.publish({ ...this.snapshot, notificationPreferences: persisted });
      } catch (error) {
        this.logger.error('Unable to update notification preference.', error);
      }
    });
  }

  refresh(): Promise<void> {
    return this.session?.accessToken ? this.refreshBookings(this.session.accessToken, this.loadVersion) : Promise.resolve();
  }

  private startPolling(accessToken: string, loadVersion: number): void {
    this.cancelPolling = this.scheduler.every(this.options.pollingIntervalMs, () => {
      if (Date.now() < this.pollPausedUntil) return;
      void this.refreshBookings(accessToken, loadVersion);
    });
  }

  private stopPolling(): void {
    this.cancelPolling?.();
    this.cancelPolling = null;
  }

  private refreshBookings(accessToken: string, loadVersion: number): Promise<void> {
    if (this.poll?.loadVersion === loadVersion) return this.poll.promise;
    const bookingMutationVersion = this.bookingMutationVersion;
    const promise = this.bookings.list(accessToken)
      .then((bookings) => {
        if (
          loadVersion !== this.loadVersion ||
          bookingMutationVersion !== this.bookingMutationVersion
        ) return;
        this.publish({
          ...this.snapshot,
          bookings: bookings.map((booking) => this.bookingFromApi(booking)),
        });
      })
      .catch((error: unknown) => {
        if (isRateLimited(error)) {
          this.pollPausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
          return;
        }
        if (isTransientOutage(error)) {
          this.pollPausedUntil = Date.now() + TRANSIENT_PAUSE_MS;
          this.logger.warn?.('Booking status refresh delayed; the API did not answer in time. Retrying shortly.', error);
          return;
        }
        this.logger.error('Unable to refresh booking statuses.', error);
      })
      .finally(() => {
        if (this.poll?.promise === promise) this.poll = null;
      });
    this.poll = { loadVersion, promise };
    return promise;
  }

  private bookingFromApi(booking: ApiBooking): ClientBooking {
    return {
      paymentSummary: booking.paymentSummary,
      payments: booking.payments,
      arrivedAt: booking.arrivedAt,
      id: booking.id,
      professionalId: booking.professionalId,
      serviceId: booking.serviceId,
      serviceName: booking.serviceName,
      dateIso: booking.dateIso,
      dateLabel: this.runtime.dateLabel(booking.dateIso),
      time: booking.time,
      proposedDateIso: booking.proposedDateIso ?? null,
      proposedTime: booking.proposedTime ?? null,
      total: booking.total,
      travelFee: booking.travelFee,
      commissionRateBps: booking.commissionRateBps,
      extraAmount: booking.extraAmount ?? 0,
      extraFee: booking.extraFee ?? 0,
      extraNote: booking.extraNote ?? null,
      discountAmount: booking.discountAmount ?? 0,
      discountReason: booking.discountReason ?? null,
      address: booking.addressDetail,
      paymentMethod: booking.paymentMethod,
      ...(booking.paymentIntent ? {
        paymentIntentId: booking.paymentIntent.id,
        paymentStatus: booking.paymentIntent.status,
        checkoutUrl: booking.paymentIntent.checkoutUrl ?? null,
      } : {}),
      status: booking.status,
      cancellationPolicy: booking.cancellationPolicy,
      cancelledBy: booking.cancelledBy ?? null,
      cancellationReason: booking.cancellationReason ?? null,
      latitude: booking.latitude ?? null,
      longitude: booking.longitude ?? null,
      tracking: booking.tracking ?? null,
      ...(booking.startedAt ? { startedAt: booking.startedAt } : {}),
      ...(booking.completedAt ? { completedAt: booking.completedAt } : {}),
      rated: Boolean(booking.review),
      ...(booking.review ? {
        rating: (booking.review.techniqueRating + booking.review.professionalismRating) / 2,
      } : {}),
      createdAt: booking.createdAt,
    };
  }

  private updateBooking(
    bookingId: string,
    update: (booking: ClientBooking) => ClientBooking,
  ): void {
    this.publish({
      ...this.snapshot,
      bookings: this.snapshot.bookings.map((booking) => (
        booking.id === bookingId ? update(booking) : booking
      )),
    });
  }

  private enqueueBookingMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const identity = this.identity;
    const guardedMutation = () => {
      if (identity !== this.identity) {
        throw new Error('The active client session changed before the booking operation started.');
      }
      return mutation();
    };
    const pending = this.bookingMutationQueue.then(guardedMutation, guardedMutation);
    this.bookingMutationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private enqueuePreferenceMutation(mutation: () => Promise<void>): Promise<void> {
    const identity = this.identity;
    const guardedMutation = () => {
      if (identity !== this.identity) {
        throw new Error('The active client session changed before the preference operation started.');
      }
      return mutation();
    };
    const pending = this.preferenceMutationQueue.then(guardedMutation, guardedMutation);
    this.preferenceMutationQueue = pending.catch(() => undefined);
    return pending;
  }

  private isCurrent(loadVersion: number, identity: string): boolean {
    return loadVersion === this.loadVersion && identity === this.identity;
  }

  private publish(snapshot: ClientDataSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

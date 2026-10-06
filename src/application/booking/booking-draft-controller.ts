import type {
  BookingDraft,
  BookingPaymentMethodId,
  BookingReceipt,
} from './booking-contracts';

export interface BookingDraftStorage {
  read(userId: string): Promise<BookingDraft | null>;
  write(userId: string, draft: BookingDraft): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface BookingRequestIdGenerator {
  generate(): string;
}

export interface BookingDraftControllerLogger {
  error(message: string, error: unknown): void;
}

export interface BookingDraftSnapshot {
  draft: BookingDraft | null;
  receipt: BookingReceipt | null;
}

type BookingDraftListener = () => void;

const silentLogger: BookingDraftControllerLogger = {
  error() {},
};

export class BookingDraftController {
  private snapshot: BookingDraftSnapshot = { draft: null, receipt: null };
  private readonly listeners = new Set<BookingDraftListener>();
  private readonly storage: BookingDraftStorage;
  private readonly requestIds: BookingRequestIdGenerator;
  private readonly logger: BookingDraftControllerLogger;
  private userId: string | null = null;
  private loadVersion = 0;
  private mutationVersion = 0;
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    storage: BookingDraftStorage,
    requestIds: BookingRequestIdGenerator,
    logger: BookingDraftControllerLogger = silentLogger,
  ) {
    this.storage = storage;
    this.requestIds = requestIds;
    this.logger = logger;
  }

  readonly getSnapshot = (): BookingDraftSnapshot => this.snapshot;

  readonly subscribe = (listener: BookingDraftListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async setUser(userId: string | null): Promise<void> {
    if (this.userId === userId) return;
    this.userId = userId;
    const loadVersion = ++this.loadVersion;
    const mutationVersion = this.mutationVersion;
    this.publish({ draft: null, receipt: null });
    if (!userId) return;

    try {
      const draft = await this.storage.read(userId);
      if (
        loadVersion !== this.loadVersion ||
        mutationVersion !== this.mutationVersion ||
        userId !== this.userId
      ) return;
      this.publish({ draft: draft?.paymentMethod === 'cash' ? { ...draft, paymentMethod: 'telebirr' } : draft, receipt: null });
    } catch (error) {
      this.logger.error('Unable to initialize the booking draft.', error);
    }
  }

  startBooking(
    professionalId: string,
    serviceIndex: number,
    defaultAddressId: string | null,
  ): Promise<void> {
    const current = this.snapshot.draft;
    if (current?.professionalId === professionalId && current.serviceIndex === serviceIndex) {
      if (this.snapshot.receipt) this.publish({ ...this.snapshot, receipt: null });
      return Promise.resolve();
    }

    this.mutationVersion += 1;
    const draft: BookingDraft = {
      requestId: this.requestIds.generate(),
      professionalId,
      serviceIndex,
      dateIso: null,
      time: null,
      addressId: defaultAddressId,
      paymentMethod: 'telebirr',
    };
    this.publish({ draft, receipt: null });
    return this.persist(draft);
  }

  selectDate(dateIso: string): Promise<void> {
    return this.updateDraft({ dateIso });
  }

  selectTime(time: string): Promise<void> {
    return this.updateDraft({ time });
  }

  selectAddress(addressId: string): Promise<void> {
    return this.updateDraft({ addressId });
  }


  selectPaymentMethod(paymentMethod: BookingPaymentMethodId): Promise<void> {
    return this.updateDraft({ paymentMethod });
  }

  setReceipt(receipt: BookingReceipt): void {
    this.publish({ ...this.snapshot, receipt });
  }

  clearBooking(): Promise<void> {
    this.mutationVersion += 1;
    this.publish({ draft: null, receipt: null });
    return this.persist(null);
  }

  private updateDraft(updates: Partial<BookingDraft>): Promise<void> {
    if (!this.snapshot.draft) return Promise.resolve();
    this.mutationVersion += 1;
    const draft = { ...this.snapshot.draft, ...updates };
    this.publish({ ...this.snapshot, draft });
    return this.persist(draft);
  }

  private persist(draft: BookingDraft | null): Promise<void> {
    const userId = this.userId;
    if (!userId) return Promise.resolve();
    return this.enqueuePersistence(async () => {
      if (draft) await this.storage.write(userId, draft);
      else await this.storage.delete(userId);
    });
  }

  private enqueuePersistence(operation: () => Promise<void>): Promise<void> {
    const pending = this.persistenceQueue.then(operation, operation);
    this.persistenceQueue = pending.catch((error) => {
      this.logger.error('Unable to persist the booking draft.', error);
    });
    return this.persistenceQueue;
  }

  private publish(snapshot: BookingDraftSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

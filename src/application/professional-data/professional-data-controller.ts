import type {
  ApiProfessionalAppLanguage,
  ApiProfessionalCatalogSettings,
  ApiProfessionalDashboard,
  ApiProfessionalJob,
} from '../../../shared/api-contracts';
import type { AuthSession } from '../auth/session-controller';
import type {
  ProfessionalBookingAction,
  ProfessionalCatalogSettings,
  ProfessionalDataApplication,
  ProfessionalJob,
  ProfessionalJobStatus,
} from './professional-data-contracts';
import { fillProfessionalToast, professionalToastCopy, type ProfessionalToastKey } from './professional-toast-copy.ts';

export interface ProfessionalDataGateway {
  loadDashboard(accessToken: string): Promise<ApiProfessionalDashboard>;
  setAvailability(accessToken: string, available: boolean): Promise<boolean>;
  loadCatalog(accessToken: string): Promise<ApiProfessionalCatalogSettings>;
  updateCatalog(
    accessToken: string,
    settings: ApiProfessionalCatalogSettings,
  ): Promise<ApiProfessionalCatalogSettings>;
  transitionBooking(
    accessToken: string,
    bookingId: string,
    action: ProfessionalBookingAction,
    options?: ProfessionalJobActionOptions,
  ): Promise<ApiProfessionalDashboard>;
}

/** Figures a professional names while acting on a job: the travel fee on accept, extras on checkout. */
export interface ProfessionalJobActionOptions {
  travelFee?: number;
  extraAmount?: number;
  extraNote?: string;
}

/** Extra services the client took, named by the professional at checkout. */
export interface ProfessionalCheckoutExtras {
  amount: number;
  note?: string;
}

export interface ProfessionalDataScheduler {
  every(milliseconds: number, task: () => void): () => void;
  after(milliseconds: number, task: () => void): () => void;
}

export interface ProfessionalDataRuntime {
  now(): number;
  dateLabel(dateIso: string): string;
}

export interface ProfessionalDataControllerLogger {
  error(message: string, error: unknown): void;
  /** Expected, self-healing conditions such as a slow or unreachable API; never a red error box. */
  warn?(message: string, error: unknown): void;
}

export interface ProfessionalDataSnapshot extends ProfessionalCatalogSettings {
  jobs: readonly ProfessionalJob[];
  /** Completed or cancelled bookings from the last 30 days, newest first. */
  recentJobs: readonly ProfessionalJob[];
  /** True once a dashboard has been loaded for this session (or none is expected). */
  dashboardLoaded: boolean;
  available: boolean;
  completedCount: number;
  weekEarnings: number;
  rating: number;
  reviewCount: number;
  /** Platform-wide maximum travel fee (ETB) this professional may set when accepting. Administrators change it. */
  travelFeeCap: number;
  sessionStartedAt: number | null;
  toast: string | null;
}

export interface ProfessionalDataControllerOptions {
  pollingIntervalMs: number;
  toastDurationMs: number;
}

type ProfessionalDataListener = () => void;

const RATE_LIMIT_PAUSE_MS = 60_000;

function isRateLimited(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 429;
}

const TRANSIENT_PAUSE_MS = 20_000;

/** Dropped connections, gateway timeouts and upstream outages: the next poll will try again. */
function isTransientOutage(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, name } = error as { status?: unknown; name?: unknown };
  return status === 0 || status === 502 || status === 503 || status === 504 || name === 'TimeoutError' || name === 'AbortError';
}


const jobStatuses: Record<ApiProfessionalJob['status'], ProfessionalJobStatus> = {
  requested: 'offer',
  accepted: 'accepted',
  on_the_way: 'traveling',
  in_progress: 'onsite',
  completed: 'onsite',
  cancelled: 'offer',
};

const silentLogger: ProfessionalDataControllerLogger = { error() {} };

function scheduledStartTimestamp(dateIso: string, time: string): number {
  const match = /^(\d{1,2}):(\d{2})\s(AM|PM)$/.exec(time);
  if (!match) return Number.NaN;
  const hour = (Number(match[1]) % 12) + (match[3] === 'PM' ? 12 : 0);
  return Date.parse(`${dateIso}T${String(hour).padStart(2, '0')}:${match[2]}:00+03:00`);
}

export class ProfessionalDataController {
  private snapshot: ProfessionalDataSnapshot;
  private readonly listeners = new Set<ProfessionalDataListener>();
  private readonly gateway: ProfessionalDataGateway;
  private readonly scheduler: ProfessionalDataScheduler;
  private readonly runtime: ProfessionalDataRuntime;
  private language: ApiProfessionalAppLanguage = 'en';
  private lastDashboard: ApiProfessionalDashboard | null = null;
  private readonly fallback: ProfessionalDataSnapshot;
  private readonly options: ProfessionalDataControllerOptions;
  private readonly logger: ProfessionalDataControllerLogger;
  private session: AuthSession | null = null;
  private identity = '';
  private loadVersion = 0;
  private jobMutationVersion = 0;
  private availabilityMutationVersion = 0;
  private catalogMutationVersion = 0;
  private toastVersion = 0;
  private cancelPolling: (() => void) | null = null;
  private cancelToast: (() => void) | null = null;
  private poll: { loadVersion: number; promise: Promise<void> } | null = null;
  /** When the API answers 429 we pause polling until this time instead of hammering it. */
  private pollPausedUntil = 0;
  private jobMutationQueue: Promise<void> = Promise.resolve();
  private availabilityMutationQueue: Promise<void> = Promise.resolve();
  private catalogMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    gateway: ProfessionalDataGateway,
    scheduler: ProfessionalDataScheduler,
    runtime: ProfessionalDataRuntime,
    fallback: ProfessionalDataSnapshot,
    options: ProfessionalDataControllerOptions,
    logger: ProfessionalDataControllerLogger = silentLogger,
  ) {
    this.gateway = gateway;
    this.scheduler = scheduler;
    this.runtime = runtime;
    this.fallback = fallback;
    this.snapshot = fallback;
    this.options = options;
    this.logger = logger;
  }

  readonly getSnapshot = (): ProfessionalDataSnapshot => this.snapshot;

  readonly subscribe = (listener: ProfessionalDataListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async activate(
    session: AuthSession | null,
    application: ProfessionalDataApplication | null,
  ): Promise<void> {
    this.stopPolling();
    this.cancelToast?.();
    this.cancelToast = null;
    this.toastVersion += 1;
    const identity = session
      ? `${session.source}:${session.userId}:${session.accessToken ?? ''}:${application?.id ?? ''}`
      : `anonymous:${application?.id ?? ''}`;
    this.identity = identity;
    this.session = session;
    const loadVersion = ++this.loadVersion;
    this.jobMutationVersion = 0;
    this.availabilityMutationVersion = 0;
    this.catalogMutationVersion = 0;

    const approved = application?.status === 'approved';
    const catalog = approved ? this.catalogFrom(application) : this.catalogFrom(this.fallback);
    this.publish({
      ...this.fallback,
      ...catalog,
      ...(approved && session?.source !== 'api' ? {
        jobs: [],
        recentJobs: [],
        dashboardLoaded: true,
        available: false,
        completedCount: 0,
        weekEarnings: 0,
        rating: 0,
        reviewCount: 0,
        sessionStartedAt: null,
      } : {}),
      ...(approved && session?.source === 'api' ? { dashboardLoaded: false } : {}),
      toast: null,
    });

    if (!approved || session?.source !== 'api' || !session.accessToken) return;
    const accessToken = session.accessToken;
    const jobMutationVersion = this.jobMutationVersion;
    const availabilityMutationVersion = this.availabilityMutationVersion;
    const catalogMutationVersion = this.catalogMutationVersion;
    this.startPolling(accessToken, loadVersion);

    const dashboardLoad = this.gateway.loadDashboard(accessToken)
      .then((dashboard) => {
        if (!this.isCurrent(loadVersion, identity)) return;
        this.applyDashboard(dashboard, jobMutationVersion, availabilityMutationVersion);
      })
      .catch((error: unknown) => {
        this.logger.error('Unable to load professional dashboard.', error);
      });
    const catalogLoad = this.gateway.loadCatalog(accessToken)
      .then((loadedCatalog) => {
        if (
          !this.isCurrent(loadVersion, identity) ||
          catalogMutationVersion !== this.catalogMutationVersion
        ) return;
        this.publish({ ...this.snapshot, ...this.catalogFrom(loadedCatalog) });
      })
      .catch((error: unknown) => {
        this.logger.error('Unable to load professional catalogue settings.', error);
      });
    await Promise.all([dashboardLoad, catalogLoad]);
  }

  deactivate(): void {
    this.stopPolling();
    this.cancelToast?.();
    this.cancelToast = null;
    this.toastVersion += 1;
    this.identity = '';
    this.session = null;
    this.loadVersion += 1;
  }

  acceptJob(jobId?: string, travelFee?: number): Promise<void> { return this.runJobAction('accept', jobId, travelFee === undefined ? undefined : { travelFee }); }
  declineJob(jobId?: string): Promise<void> { return this.runJobAction('decline', jobId); }
  startTravel(jobId?: string): Promise<void> { return this.runJobAction('travel', jobId); }
  arrive(jobId?: string): Promise<void> { return this.runJobAction('arrive', jobId); }
  checkIn(jobId?: string): Promise<void> { return this.runJobAction('check-in', jobId); }
  reportClientNoShow(jobId?: string): Promise<void> { return this.runJobAction('no-show', jobId); }
  approveReschedule(jobId?: string): Promise<void> { return this.runJobAction('approve-reschedule', jobId); }
  declineReschedule(jobId?: string): Promise<void> { return this.runJobAction('decline-reschedule', jobId); }
  completeJob(jobId?: string, extras?: ProfessionalCheckoutExtras): Promise<void> {
    return this.runJobAction('complete', jobId, extras ? { extraAmount: extras.amount, ...(extras.note ? { extraNote: extras.note } : {}) } : undefined);
  }

  toggleAvailable(): Promise<void> {
    const identity = this.identity;
    return this.enqueueAvailabilityMutation(async () => {
      if (identity !== this.identity) return;
      const next = !this.snapshot.available;
      if (this.session?.source !== 'api' || !this.session.accessToken) {
        this.availabilityMutationVersion += 1;
        this.publish({ ...this.snapshot, available: next });
        return;
      }
      try {
        const available = await this.gateway.setAvailability(this.session.accessToken, next);
        if (identity !== this.identity) return;
        this.availabilityMutationVersion += 1;
        this.publish({ ...this.snapshot, available });
      } catch (error) {
        this.logger.error('Unable to update professional availability.', error);
        if (identity === this.identity) {
          this.showToast(this.errorMessage(error, this.copy('availabilityFailed')));
        }
      }
    });
  }

  removeService(serviceId: string): Promise<void> {
    if (this.snapshot.services.length <= 1) {
      this.showToast(this.copy('keepOneService'));
      return Promise.resolve();
    }
    return this.updateCatalog({
      ...this.catalogFrom(this.snapshot),
      services: this.snapshot.services.filter((service) => service.id !== serviceId),
    });
  }

  /** Prices change here, on the professional's profile, never on a booking. */
  updateServicePrice(serviceId: string, price: number): Promise<void> {
    if (!Number.isInteger(price) || price < 50 || price > 100_000) {
      this.showToast(this.copy('priceRange'));
      return Promise.resolve();
    }
    const pending = this.updateCatalog({
      ...this.catalogFrom(this.snapshot),
      services: this.snapshot.services.map((service) => (service.id === serviceId ? { ...service, price } : service)),
    });
    this.showToast(this.copy('priceUpdated'));
    return pending;
  }

  addService(): Promise<void> {
    if (this.snapshot.services.some((service) => service.id === 'sv-new')) {
      return Promise.resolve();
    }
    const pending = this.updateCatalog({
      ...this.catalogFrom(this.snapshot),
      services: [...this.snapshot.services, {
        id: 'sv-new',
        category: 'Hair styling',
        name: 'Wash & finish',
        durationMinutes: 60,
        price: 700,
        note: 'Client provides preferred finishing products',
        popular: false,
      }],
    });
    this.showToast(this.copy('serviceAdded'));
    return pending;
  }

  toggleWorkingDay(day: string): Promise<void> {
    return this.updateCatalog({
      ...this.catalogFrom(this.snapshot),
      workingDays: this.snapshot.workingDays.map((item) => (
        item.day === day ? { ...item, enabled: !item.enabled } : item
      )),
    });
  }

  toggleTravelZone(zoneId: string): Promise<void> {
    return this.updateCatalog({
      ...this.catalogFrom(this.snapshot),
      travelZones: this.snapshot.travelZones.map((zone) => (
        zone.id === zoneId ? { ...zone, active: !zone.active } : zone
      )),
    });
  }

  toggleSameDayBookings(): Promise<void> {
    return this.updateCatalog({
      ...this.catalogFrom(this.snapshot),
      sameDayBookings: !this.snapshot.sameDayBookings,
    });
  }

  showToast(message: string): void {
    this.cancelToast?.();
    const toastVersion = ++this.toastVersion;
    this.publish({ ...this.snapshot, toast: message });
    this.cancelToast = this.scheduler.after(this.options.toastDurationMs, () => {
      if (toastVersion !== this.toastVersion) return;
      this.cancelToast = null;
      this.publish({ ...this.snapshot, toast: null });
    });
  }

  private runJobAction(action: ProfessionalBookingAction, jobId?: string, options?: ProfessionalJobActionOptions): Promise<void> {
    const identity = this.identity;
    return this.enqueueJobMutation(async () => {
      if (identity !== this.identity) return;
      const activeJob = jobId
        ? this.snapshot.jobs.find((job) => job.id === jobId)
        : this.snapshot.jobs[0];
      if (!activeJob) return;
      if (this.session?.source !== 'api' || !this.session.accessToken) {
        this.applyLocalJobAction(action, activeJob, options?.travelFee);
        return;
      }
      const mutationVersion = ++this.jobMutationVersion;
      try {
        const dashboard = await this.gateway.transitionBooking(
          this.session.accessToken,
          activeJob.id,
          action,
          options,
        );
        if (identity !== this.identity || mutationVersion !== this.jobMutationVersion) return;
        this.applyDashboard(dashboard, mutationVersion, this.availabilityMutationVersion);
      } catch (error) {
        // A refused action (4xx) carries the reason for the professional; it is
        // shown as a toast, not raised as a red error.
        const status = error instanceof Error && 'status' in error ? (error as { status?: unknown }).status : undefined;
        const refused = typeof status === 'number' && status >= 400 && status < 500;
        if (refused && this.logger.warn) this.logger.warn(`Professional booking action ${action} was refused.`, error);
        else this.logger.error(`Unable to ${action} professional booking.`, error);
        if (identity === this.identity) {
          this.showToast(this.errorMessage(error, this.copy('bookingFailed')));
        }
      }
    });
  }

  private applyLocalJobAction(action: ProfessionalBookingAction, activeJob: ProfessionalJob, travelFee?: number): void {
    this.jobMutationVersion += 1;
    if (action === 'approve-reschedule' || action === 'decline-reschedule') {
      this.publish({ ...this.snapshot, jobs: this.snapshot.jobs.map((job) => (job.id === activeJob.id ? {
        ...job,
        ...(action === 'approve-reschedule' && job.proposedDateIso && job.proposedTime
          ? { time: `${this.runtime.dateLabel(job.proposedDateIso)} ${this.copy('timeJoiner')} ${job.proposedTime}` }
          : {}),
        proposedDateIso: null,
        proposedTime: null,
      } : job)) });
      return;
    }
    if (action === 'arrive') {
      this.publish({ ...this.snapshot, jobs: this.snapshot.jobs.map((job) => job.id === activeJob.id ? { ...job, arrivedAt: new Date(this.runtime.now()).toISOString() } : job) });
      return;
    }
    if (action === 'accept' || action === 'travel' || action === 'check-in') {
      const status: ProfessionalJobStatus = action === 'accept'
        ? 'accepted'
        : action === 'travel' ? 'traveling' : 'onsite';
      // Mirror the server: the accepted travel fee is added to what the client pays.
      const acceptedTravelFee = action === 'accept' && travelFee !== undefined
        ? Math.min(Math.max(0, Math.round(travelFee)), this.snapshot.travelFeeCap)
        : null;
      this.publish({
        ...this.snapshot,
        jobs: this.snapshot.jobs.map((job) => job.id === activeJob.id
          ? {
            ...job,
            status,
            ...(acceptedTravelFee !== null
              ? { travelFee: acceptedTravelFee, price: job.price - job.travelFee + acceptedTravelFee }
              : {}),
          }
          : job),
        ...(action === 'check-in' ? { sessionStartedAt: this.runtime.now() } : {}),
      });
      return;
    }
    const jobs = this.snapshot.jobs.filter((job) => job.id !== activeJob.id);
    if (action === 'complete') {
      this.publish({
        ...this.snapshot,
        jobs,
        weekEarnings: this.snapshot.weekEarnings + activeJob.price,
        completedCount: this.snapshot.completedCount + 1,
        sessionStartedAt: null,
      });
      this.showToast(this.copy('sessionComplete', { name: activeJob.name }));
      return;
    }
    this.publish({ ...this.snapshot, jobs, sessionStartedAt: null });
    this.showToast(this.copy(action === 'decline' ? 'declined' : 'noShowRecorded'));
  }

  private updateCatalog(next: ProfessionalCatalogSettings): Promise<void> {
    const identity = this.identity;
    const mutationVersion = ++this.catalogMutationVersion;
    this.publish({ ...this.snapshot, ...next });
    if (this.session?.source !== 'api' || !this.session.accessToken) return Promise.resolve();
    const accessToken = this.session.accessToken;
    return this.enqueueCatalogMutation(async () => {
      if (identity !== this.identity) return;
      try {
        const saved = await this.gateway.updateCatalog(accessToken, next);
        if (identity !== this.identity || mutationVersion !== this.catalogMutationVersion) return;
        this.publish({ ...this.snapshot, ...this.catalogFrom(saved) });
        this.showToast(this.copy('catalogSaved'));
      } catch (error) {
        this.logger.error('Unable to save professional catalogue.', error);
        if (identity === this.identity) {
          this.showToast(this.errorMessage(error, this.copy('catalogFailed')));
        }
      }
    });
  }

  refresh(): Promise<void> {
    return this.session?.accessToken ? this.refreshDashboard(this.session.accessToken, this.loadVersion) : Promise.resolve();
  }

  private startPolling(accessToken: string, loadVersion: number): void {
    this.cancelPolling = this.scheduler.every(this.options.pollingIntervalMs, () => {
      void this.refreshDashboard(accessToken, loadVersion);
    });
  }

  private stopPolling(): void {
    this.cancelPolling?.();
    this.cancelPolling = null;
  }

  private refreshDashboard(accessToken: string, loadVersion: number): Promise<void> {
    if (this.poll?.loadVersion === loadVersion) return this.poll.promise;
    if (Date.now() < this.pollPausedUntil) return Promise.resolve();
    const jobMutationVersion = this.jobMutationVersion;
    const availabilityMutationVersion = this.availabilityMutationVersion;
    const promise = this.gateway.loadDashboard(accessToken)
      .then((dashboard) => {
        if (loadVersion !== this.loadVersion) return;
        this.applyDashboard(dashboard, jobMutationVersion, availabilityMutationVersion);
      })
      .catch((error: unknown) => {
        if (isRateLimited(error)) {
          this.pollPausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
          return;
        }
        if (isTransientOutage(error)) {
          this.pollPausedUntil = Date.now() + TRANSIENT_PAUSE_MS;
          this.logger.warn?.('Dashboard refresh delayed; the API could not be reached. Retrying shortly.', error);
          return;
        }
        this.logger.error('Unable to refresh professional dashboard.', error);
      })
      .finally(() => {
        if (this.poll?.promise === promise) this.poll = null;
      });
    this.poll = { loadVersion, promise };
    return promise;
  }

  private applyDashboard(
    dashboard: ApiProfessionalDashboard,
    jobMutationVersion: number,
    availabilityMutationVersion: number,
  ): void {
    this.lastDashboard = dashboard;
    const jobs = dashboard.jobs.map((job) => this.jobFromApi(job));
    const recentJobs = (dashboard.recentJobs ?? []).map((job) => ({
      ...this.jobFromApi(job),
      outcome: job.status === 'cancelled' ? 'cancelled' as const : 'completed' as const,
      completedAt: job.completedAt ?? null,
    }));
    const active = dashboard.jobs.find((job) => job.status === 'in_progress');
    const startedAt = active?.startedAt ? Date.parse(active.startedAt) : Number.NaN;
    this.publish({
      ...this.snapshot,
      dashboardLoaded: true,
      rating: dashboard.rating ?? 0,
      reviewCount: dashboard.reviewCount ?? 0,
      ...(jobMutationVersion === this.jobMutationVersion ? {
        jobs,
        recentJobs,
        completedCount: dashboard.completedCount,
        weekEarnings: dashboard.weekEarnings,
        sessionStartedAt: Number.isNaN(startedAt) ? null : startedAt,
      } : {}),
      // The cap is a platform rule rather than job state, so the latest value always wins.
      travelFeeCap: dashboard.travelFeeCap,
      ...(availabilityMutationVersion === this.availabilityMutationVersion
        ? { available: dashboard.available }
        : {}),
    });
  }

  private jobFromApi(job: ApiProfessionalJob): ProfessionalJob {
    const initials = job.clientName
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const scheduledStartAt = scheduledStartTimestamp(job.dateIso, job.time);
    return {
      paymentSummary: job.paymentSummary,
      arrivedAt: job.arrivedAt,
      startedAt: job.startedAt,
      id: job.id,
      ...(job.clientId ? { clientId: job.clientId } : {}),
      name: job.clientName,
      initials,
      service: job.serviceName,
      description: this.copy('jobDescription'),
      price: job.total,
      payment: this.paymentLabel(job.paymentMethod),
      time: `${this.runtime.dateLabel(job.dateIso)} ${this.copy('timeJoiner')} ${job.time}`,
      proposedDateIso: job.proposedDateIso ?? null,
      proposedTime: job.proposedTime ?? null,
      ...(!Number.isNaN(scheduledStartAt) ? { scheduledStartAt } : {}),
      address: `${job.addressLabel} · ${job.addressZone}`,
      addressDetail: job.addressDetail,
      travelFee: job.travelFee,
      extraAmount: job.extraAmount ?? 0,
      extraFee: job.extraFee ?? 0,
      extraNote: job.extraNote ?? null,
      commissionRateBps: job.commissionRateBps,
      status: jobStatuses[job.status],
      destination: typeof job.latitude === 'number' && typeof job.longitude === 'number'
        ? { latitude: job.latitude, longitude: job.longitude }
        : null,
      lastReported: job.tracking
        ? { latitude: job.tracking.latitude, longitude: job.tracking.longitude, recordedAt: job.tracking.recordedAt }
        : null,
    };
  }

  private catalogFrom(settings: ProfessionalCatalogSettings): ProfessionalCatalogSettings {
    return {
      services: settings.services,
      workingDays: settings.workingDays,
      travelZones: settings.travelZones,
      sameDayBookings: settings.sameDayBookings,
    };
  }

  private enqueueJobMutation(mutation: () => Promise<void>): Promise<void> {
    const pending = this.jobMutationQueue.then(mutation, mutation);
    this.jobMutationQueue = pending.catch(() => undefined);
    return pending;
  }

  private enqueueAvailabilityMutation(mutation: () => Promise<void>): Promise<void> {
    const pending = this.availabilityMutationQueue.then(mutation, mutation);
    this.availabilityMutationQueue = pending.catch(() => undefined);
    return pending;
  }

  private enqueueCatalogMutation(mutation: () => Promise<void>): Promise<void> {
    const pending = this.catalogMutationQueue.then(mutation, mutation);
    this.catalogMutationQueue = pending.catch(() => undefined);
    return pending;
  }

  private isCurrent(loadVersion: number, identity: string): boolean {
    return loadVersion === this.loadVersion && identity === this.identity;
  }

  /** The language the professional registered with; job labels and toasts follow it. */
  setLanguage(language: ApiProfessionalAppLanguage): void {
    if (language === this.language) return;
    this.language = language;
    // Job labels (description, payment, date) are built from the API jobs, so rebuild them.
    if (this.lastDashboard) this.applyDashboard(this.lastDashboard, this.jobMutationVersion, this.availabilityMutationVersion);
  }

  private copy(key: ProfessionalToastKey, params?: Record<string, string | number>): string {
    return fillProfessionalToast(professionalToastCopy[this.language][key], params);
  }

  private paymentLabel(method: ApiProfessionalJob['paymentMethod']): string {
    if (method === 'telebirr') return 'Telebirr';
    if (method === 'cbe') return 'CBE Birr';
    return this.copy(method === 'card' ? 'paymentCard' : 'paymentCash');
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private publish(snapshot: ProfessionalDataSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

import type { AuthSession } from '../auth/session-controller';
import type {
  ProfessionalApplication,
  ProfessionalAppLanguage,
  ProfessionalProfileDraft,
  ProfessionalRegistrationDraft,
  ProfessionalServiceDraft,
} from './professional-registration-contracts';
import {
  getSpecialtyLabel,
  serviceCategoryForSpecialty,
  withPrimarySpecialtyServiceCategories,
} from './professional-registration-contracts.ts';

export interface StoredProfessionalRegistration {
  draft: ProfessionalRegistrationDraft;
  application: ProfessionalApplication | null;
  remoteRevision?: number;
  dirtyDraft?: boolean;
}

export interface ProfessionalRegistrationStorage {
  read(userId: string): Promise<StoredProfessionalRegistration | null>;
  write(userId: string, value: StoredProfessionalRegistration): Promise<void>;
  delete(userId: string): Promise<void>;
}

export interface ProfessionalRegistrationGateway {
  loadDraft?(): Promise<{ draft: ProfessionalRegistrationDraft; revision: number } | null>;
  saveDraft?(draft: ProfessionalRegistrationDraft, expectedRevision: number): Promise<number>;
  loadApplication(accessToken: string): Promise<ProfessionalApplication | null>;
  submitApplication(
    draft: ProfessionalRegistrationDraft,
    accessToken?: string,
  ): Promise<ProfessionalApplication>;
  /** Approved professionals: save everything except the approved specialty. */
  updateApprovedProfile?(draft: ProfessionalRegistrationDraft): Promise<ProfessionalApplication>;
  /** Zones a professional can choose as base location or travel area. */
  listZones?(): Promise<readonly { id: string; label: string }[]>;
}

export interface ProfessionalRegistrationRuntime {
  createServiceId(): string;
}

export interface ProfessionalRegistrationControllerLogger {
  error(message: string, error: unknown): void;
}

export type ProfessionalRegistrationLoadStatus = 'loading' | 'ready' | 'error';

export interface ProfessionalRegistrationSnapshot {
  application: ProfessionalApplication | null;
  draft: ProfessionalRegistrationDraft;
  loadStatus: ProfessionalRegistrationLoadStatus;
  syncStatus: 'saved' | 'saving' | 'error';
  syncError: string | null;
}

type ProfessionalRegistrationListener = () => void;

const workingHourOptions = [
  '12:00 AM – 11:59 PM',
  '6:00 AM – 2:00 PM',
  '8:00 AM – 4:00 PM',
  '9:00 AM – 6:00 PM',
  '10:00 AM – 7:00 PM',
  '2:00 PM – 10:00 PM',
  '4:00 PM – 11:59 PM',
] as const;

const silentLogger: ProfessionalRegistrationControllerLogger = { error() {} };

function draftFromApplication(
  application: ProfessionalApplication,
): ProfessionalRegistrationDraft {
  const { id: _id, status: _status, submittedAt: _submittedAt, reviewNote: _reviewNote, ...draft } = application;
  return withPrimarySpecialtyServiceCategories(draft);
}

export class ProfessionalRegistrationController {
  private snapshot: ProfessionalRegistrationSnapshot;
  private readonly listeners = new Set<ProfessionalRegistrationListener>();
  private readonly storage: ProfessionalRegistrationStorage;
  private readonly gateway: ProfessionalRegistrationGateway;
  private readonly runtime: ProfessionalRegistrationRuntime;
  private readonly initialDraft: ProfessionalRegistrationDraft;
  private readonly logger: ProfessionalRegistrationControllerLogger;
  private session: AuthSession | null = null;
  private userId = 'anonymous';
  private identity = '';
  private loadVersion = 0;
  private commandQueue: Promise<void> = Promise.resolve();
  private remoteRevision = 0;
  private dirtyDraft = false;
  private draftVersion = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncQueue: Promise<void> = Promise.resolve();
  private persistenceQueue: Promise<void> = Promise.resolve();

  constructor(
    storage: ProfessionalRegistrationStorage,
    gateway: ProfessionalRegistrationGateway,
    runtime: ProfessionalRegistrationRuntime,
    initialDraft: ProfessionalRegistrationDraft,
    logger: ProfessionalRegistrationControllerLogger = silentLogger,
  ) {
    this.storage = storage;
    this.gateway = gateway;
    this.runtime = runtime;
    this.initialDraft = initialDraft;
    this.logger = logger;
    this.snapshot = {
      application: null,
      draft: initialDraft,
      loadStatus: 'loading',
      syncStatus: 'saved',
      syncError: null,
    };
  }

  readonly getSnapshot = (): ProfessionalRegistrationSnapshot => this.snapshot;

  readonly subscribe = (listener: ProfessionalRegistrationListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async setSession(session: AuthSession | null): Promise<void> {
    session = session?.role === 'professional' ? session : null;
    this.session = session;
    const identity = session
      ? `${session.source}:${session.userId}`
      : 'anonymous';
    if (identity === this.identity) return;
    this.cancelSyncTimer();
    this.remoteRevision = 0;
    this.dirtyDraft = false;
    this.identity = identity;
    this.session = session;
    this.userId = session?.userId ?? 'anonymous';
    const userId = this.userId;
    const loadVersion = ++this.loadVersion;
    this.publish({
      application: null,
      draft: this.initialDraft,
      loadStatus: 'loading',
      syncStatus: 'saved',
      syncError: null,
    });

    try {
      const stored = await this.storage.read(userId);
      if (!this.isCurrent(loadVersion, identity)) return;
      if (stored) {
        this.remoteRevision = stored.remoteRevision ?? 0;
        this.dirtyDraft = stored.dirtyDraft ?? false;
        this.publish({
          ...this.snapshot,
          application: stored.application,
          draft: withPrimarySpecialtyServiceCategories(stored.draft),
          loadStatus: 'loading',
        });
      }
    } catch (error) {
      this.logger.error('Unable to restore the professional registration.', error);
    }
    if (!this.isCurrent(loadVersion, identity)) return;

    if (session?.source === 'api' && session.accessToken) {
      try {
        const remote = await this.gateway.loadApplication(session.accessToken);
        if (!this.isCurrent(loadVersion, identity)) return;
        const editable = !remote || ['rejected', 'changes_requested'].includes(remote.status);
        const cloud = editable && this.gateway.loadDraft ? await this.gateway.loadDraft() : null;
        if (!this.isCurrent(loadVersion, identity)) return;
        let draft = this.snapshot.draft;
        if (!editable) {
          draft = draftFromApplication(remote!);
          this.dirtyDraft = false;
          this.remoteRevision = 0;
        } else if (this.dirtyDraft) {
          if ((cloud?.revision ?? 0) !== this.remoteRevision) {
            this.publish({ ...this.snapshot, syncStatus: 'error', syncError: 'Your registration changed on another device. Load the saved version to continue.' });
          }
        } else {
          draft = cloud?.draft ?? (remote ? draftFromApplication(remote) : draft);
          this.remoteRevision = cloud?.revision ?? 0;
        }
        this.publish({ ...this.snapshot, application: remote, draft: withPrimarySpecialtyServiceCategories(draft) });
      } catch (error) {
        this.logger.error('Unable to refresh the professional registration.', error);
        if (this.isCurrent(loadVersion, identity)) {
          this.publish({ ...this.snapshot, loadStatus: 'error' });
        }
        return;
      }
    }

    if (!this.isCurrent(loadVersion, identity)) return;
    this.publish({ ...this.snapshot, loadStatus: 'ready' });
    this.persistSnapshot(userId, this.snapshot);
    if (this.dirtyDraft && this.snapshot.syncStatus !== 'error') this.scheduleSync();
  }

  deactivate(): void {
    this.cancelSyncTimer();
    this.identity = '';
    this.session = null;
    this.loadVersion += 1;
  }

  retryLoad(): Promise<void> {
    const session = this.session;
    this.identity = '';
    return this.setSession(session);
  }

  async loadSavedDraft(): Promise<void> {
    if (!this.gateway.loadDraft) return;
    const identity = this.identity;
    // Let a pending save finish before replacing the local copy.
    await this.syncQueue;
    const cloud = await this.gateway.loadDraft();
    this.requireIdentity(identity);
    this.cancelSyncTimer();
    this.remoteRevision = cloud?.revision ?? 0;
    this.dirtyDraft = false;
    this.publishAndPersist({ ...this.snapshot,
      draft: cloud?.draft ?? (this.snapshot.application ? draftFromApplication(this.snapshot.application) : this.initialDraft),
      syncStatus: 'saved', syncError: null });
  }

  syncDraft(): Promise<void> {
    this.cancelSyncTimer();
    const identity = this.identity;
    const run = async () => {
      if (identity !== this.identity || !this.dirtyDraft || !this.gateway.saveDraft || this.session?.source !== 'api') return;
      const version = this.draftVersion;
      const draft = this.snapshot.draft;
      const revision = this.remoteRevision;
      this.publish({ ...this.snapshot, syncStatus: 'saving', syncError: null });
      try {
        const nextRevision = await this.gateway.saveDraft(draft, revision);
        this.requireIdentity(identity);
        this.remoteRevision = nextRevision;
        this.dirtyDraft = version !== this.draftVersion;
        this.publishAndPersist({ ...this.snapshot, syncStatus: this.dirtyDraft ? 'saving' : 'saved', syncError: null });
        if (this.dirtyDraft) this.scheduleSync();
      } catch (error) {
        if (identity === this.identity) this.publish({ ...this.snapshot, syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Your changes could not be saved online. Retry to sync.' });
        throw error;
      }
    };
    const pending = this.syncQueue.then(run);
    this.syncQueue = pending.catch(() => undefined);
    return pending;
  }

  private cancelSyncTimer(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }

  private scheduleSync(): void {
    if (!this.gateway.saveDraft || this.session?.source !== 'api') return;
    this.cancelSyncTimer();
    this.publish({ ...this.snapshot, syncStatus: 'saving' });
    this.syncTimer = setTimeout(() => { void this.syncDraft().catch(() => undefined); }, 750);
  }

  refreshApplication(): Promise<void> {
    return this.enqueueCommand(async (identity) => {
      if (this.session?.source !== 'api' || !this.session.accessToken) {
        throw new Error('Connect to the application service to check your review status.');
      }
      const application = await this.gateway.loadApplication(this.session.accessToken);
      this.requireIdentity(identity);
      this.publishAndPersist({
        ...this.snapshot,
        application,
        // Do not erase edits when a rejected application is being corrected.
        ...(application?.status === 'approved' ? { draft: draftFromApplication(application) } : {}),
      });
    });
  }

  updateProfile(changes: Partial<ProfessionalProfileDraft>): void {
    const specialtyChanged = Object.prototype.hasOwnProperty.call(changes, 'specialty');
    const specialty = changes.specialty ?? this.snapshot.draft.profile.specialty;
    const serviceName = specialty ? getSpecialtyLabel(specialty) : '';
    this.updateDraft({
      ...this.snapshot.draft,
      profile: { ...this.snapshot.draft.profile, ...changes },
      services: specialtyChanged
        ? this.snapshot.draft.services.map((service) => ({
            ...service,
            category: serviceCategoryForSpecialty(specialty),
            name: serviceName,
          }))
        : this.snapshot.draft.services,
    });
  }

  setPreferredLanguage(preferredLanguage: ProfessionalAppLanguage): void {
    this.updateDraft({ ...this.snapshot.draft, preferredLanguage });
  }

  addService(): void {
    this.updateDraft({
      ...this.snapshot.draft,
      services: [...this.snapshot.draft.services, {
        id: this.runtime.createServiceId(),
        category: serviceCategoryForSpecialty(this.snapshot.draft.profile.specialty),
        name: this.snapshot.draft.profile.specialty
          ? getSpecialtyLabel(this.snapshot.draft.profile.specialty)
          : '',
        durationMinutes: 60,
        price: 500,
        note: '',
        popular: false,
      }],
    });
  }

  updateService(id: string, changes: Partial<ProfessionalServiceDraft>): void {
    this.updateDraft({
      ...this.snapshot.draft,
      services: this.snapshot.draft.services.map((service) => (
        service.id === id ? { ...service, ...changes } : service
      )),
    });
  }

  removeService(id: string): void {
    this.updateDraft({
      ...this.snapshot.draft,
      services: this.snapshot.draft.services.filter((service) => service.id !== id),
    });
  }

  toggleWorkingDay(day: string): void {
    this.updateDraft({
      ...this.snapshot.draft,
      workingDays: this.snapshot.draft.workingDays.map((item) => {
        if (item.day !== day) return item;
        // A day switched on keeps real hours; older drafts carried a "Day off"
        // label there, which the submission could not read as a time.
        const hours = !item.enabled && !workingHourOptions.includes(item.hours as typeof workingHourOptions[number]) && !/\d:\d\d/.test(item.hours)
          ? '9:00 AM – 6:00 PM'
          : item.hours;
        return { ...item, enabled: !item.enabled, hours };
      }),
    });
  }

  cycleWorkingHours(day: string): void {
    this.updateDraft({
      ...this.snapshot.draft,
      workingDays: this.snapshot.draft.workingDays.map((item) => {
        if (item.day !== day) return item;
        const index = workingHourOptions.indexOf(item.hours as typeof workingHourOptions[number]);
        return { ...item, hours: workingHourOptions[(index + 1) % workingHourOptions.length] };
      }),
    });
  }

  toggleTravelZone(id: string): void {
    this.updateDraft({
      ...this.snapshot.draft,
      travelZones: this.snapshot.draft.travelZones.map((zone) => (
        zone.id === id ? { ...zone, active: !zone.active } : zone
      )),
    });
  }

  toggleSameDayBookings(): void {
    this.updateDraft({
      ...this.snapshot.draft,
      sameDayBookings: !this.snapshot.draft.sameDayBookings,
    });
  }

  setTermsAccepted(termsAccepted: boolean): void {
    this.updateDraft({ ...this.snapshot.draft, termsAccepted });
  }

  submit(): Promise<void> {
    return this.enqueueCommand(async (identity) => {
      if (this.snapshot.application?.status === 'pending') return;
      if (this.snapshot.application && !['rejected', 'changes_requested'].includes(this.snapshot.application.status)) {
        throw new Error('This application cannot be resubmitted.');
      }
      if (this.gateway.saveDraft) await this.syncDraft();
      this.requireIdentity(identity);
      const application = await this.gateway.submitApplication(
        this.snapshot.draft,
        this.session?.accessToken,
      );
      this.requireIdentity(identity);
      this.cancelSyncTimer();
      this.dirtyDraft = false;
      this.remoteRevision = 0;
      this.publishAndPersist({ ...this.snapshot, application, syncStatus: 'saved', syncError: null });
    });
  }

  saveApprovedProfile(draft: ProfessionalRegistrationDraft): Promise<void> {
    return this.enqueueCommand(async (identity) => {
      if (!this.gateway.updateApprovedProfile) {
        throw new Error('Profile editing is not available right now.');
      }
      const application = await this.gateway.updateApprovedProfile(draft);
      this.requireIdentity(identity);
      this.publishAndPersist({
        ...this.snapshot,
        application,
        draft: draftFromApplication(application),
      });
    });
  }

  async listZones(): Promise<readonly { id: string; label: string }[]> {
    return this.gateway.listZones ? await this.gateway.listZones() : [];
  }

  private updateDraft(draft: ProfessionalRegistrationDraft): void {
    this.draftVersion += 1;
    this.dirtyDraft = true;
    this.publishAndPersist({ ...this.snapshot, draft });
    this.scheduleSync();
  }

  private publishAndPersist(snapshot: ProfessionalRegistrationSnapshot): void {
    this.publish(snapshot);
    if (snapshot.loadStatus === 'ready') this.persistSnapshot(this.userId, snapshot);
  }

  private persistSnapshot(userId: string, snapshot: ProfessionalRegistrationSnapshot): void {
    const value = { draft: snapshot.draft, application: snapshot.application, remoteRevision: this.remoteRevision, dirtyDraft: this.dirtyDraft };
    const pending = this.persistenceQueue.then(() => this.storage.write(userId, value));
    this.persistenceQueue = pending.catch((error: unknown) => {
      this.logger.error('Unable to save the professional registration.', error);
    });
  }

  private enqueueCommand(command: (identity: string) => Promise<void>): Promise<void> {
    const identity = this.identity;
    const guardedCommand = () => {
      if (identity !== this.identity) {
        throw new Error('The active professional session changed before the operation started.');
      }
      return command(identity);
    };
    const pending = this.commandQueue.then(guardedCommand, guardedCommand);
    this.commandQueue = pending.catch(() => undefined);
    return pending;
  }

  private isCurrent(loadVersion: number, identity: string): boolean {
    return loadVersion === this.loadVersion && identity === this.identity;
  }

  private requireIdentity(identity: string): void {
    if (identity !== this.identity) {
      throw new Error('The active professional session changed during the operation.');
    }
  }

  private publish(snapshot: ProfessionalRegistrationSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

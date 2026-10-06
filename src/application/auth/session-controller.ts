import type { ApiAccountRole } from '../../../shared/api-contracts';

export interface AuthSession {
  userId: string;
  expiresAt: number;
  source: 'development' | 'api';
  role: ApiAccountRole;
  authMethod: 'phone_otp' | 'email_password' | 'google';
  email?: string;
  phoneNumber?: string;
  /** False when the phone number has not been proven with an SMS code yet. */
  phoneVerified?: boolean;
  displayName?: string;
  accessToken?: string;
}

export type SessionStatus = 'restoring' | 'authenticated' | 'unauthenticated';

export interface SessionSnapshot {
  session: AuthSession | null;
  status: SessionStatus;
}

export interface SessionStorage {
  read(): Promise<AuthSession | null>;
  write(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionRevocationGateway {
  revoke(session: AuthSession): Promise<void>;
}

export interface ExternalSessionSource {
  subscribe(listener: (session: AuthSession | null) => void): () => void;
}

export interface SessionControllerLogger {
  error(message: string, error: unknown): void;
}

type SessionListener = () => void;

const silentLogger: SessionControllerLogger = {
  error() {},
};

export class SessionController {
  private snapshot: SessionSnapshot = { session: null, status: 'restoring' };
  private readonly listeners = new Set<SessionListener>();
  private readonly storage: SessionStorage;
  private readonly revocationGateway: SessionRevocationGateway;
  private readonly logger: SessionControllerLogger;
  private mutationVersion = 0;
  private mutationQueue: Promise<void> = Promise.resolve();
  private restorePromise: Promise<void> | null = null;
  private readonly externalSessions: ExternalSessionSource | null;
  private cancelExternalSessions: (() => void) | null = null;

  constructor(
    storage: SessionStorage,
    revocationGateway: SessionRevocationGateway,
    logger: SessionControllerLogger = silentLogger,
    externalSessions: ExternalSessionSource | null = null,
  ) {
    this.storage = storage;
    this.revocationGateway = revocationGateway;
    this.logger = logger;
    this.externalSessions = externalSessions;
  }

  readonly getSnapshot = (): SessionSnapshot => this.snapshot;

  readonly subscribe = (listener: SessionListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  restore(): Promise<void> {
    if (this.restorePromise) return this.restorePromise;
    if (this.snapshot.status !== 'restoring') return Promise.resolve();

    const mutationVersion = this.mutationVersion;
    this.restorePromise = this.restoreSession(mutationVersion).finally(() => {
      this.restorePromise = null;
    });
    return this.restorePromise;
  }

  activate(): void {
    if (!this.externalSessions || this.cancelExternalSessions) return;
    this.cancelExternalSessions = this.externalSessions.subscribe((session) => {
      void this.synchronizeExternalSession(session).catch((error: unknown) => {
        this.logger.error('Unable to synchronize the external authentication session.', error);
      });
    });
  }

  deactivate(): void {
    this.cancelExternalSessions?.();
    this.cancelExternalSessions = null;
  }

  completeSignIn(session: AuthSession): Promise<void> {
    this.mutationVersion += 1;
    return this.enqueueMutation(async () => {
      await this.storage.write(session);
      this.publish({ session, status: 'authenticated' });
    });
  }

  signOut(): Promise<void> {
    this.mutationVersion += 1;
    return this.enqueueMutation(async () => {
      const session = this.snapshot.session;
      if (session) {
        try {
          await this.revocationGateway.revoke(session);
        } catch (error) {
          this.logger.error('Unable to revoke the remote session.', error);
        }
      }

      await this.storage.clear();
      this.publish({ session: null, status: 'unauthenticated' });
    });
  }

  synchronizeExternalSession(session: AuthSession | null): Promise<void> {
    this.mutationVersion += 1;
    return this.enqueueMutation(async () => {
      if (session) {
        await this.storage.write(session);
        this.publish({ session, status: 'authenticated' });
        return;
      }
      await this.storage.clear();
      this.publish({ session: null, status: 'unauthenticated' });
    });
  }

  private async restoreSession(mutationVersion: number): Promise<void> {
    try {
      const session = await this.storage.read();
      if (mutationVersion !== this.mutationVersion) return;
      this.publish({
        session,
        status: session ? 'authenticated' : 'unauthenticated',
      });
    } catch (error) {
      this.logger.error('Unable to initialize the authentication session.', error);
      if (mutationVersion !== this.mutationVersion) return;
      this.publish({ session: null, status: 'unauthenticated' });
    }
  }

  private enqueueMutation(mutation: () => Promise<void>): Promise<void> {
    const pending = this.mutationQueue.then(mutation, mutation);
    this.mutationQueue = pending.catch(() => undefined);
    return pending;
  }

  private publish(snapshot: SessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

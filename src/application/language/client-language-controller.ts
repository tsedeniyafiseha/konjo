import type { ClientPreferredLanguage } from '../client-account/client-account-contracts';

export interface ClientLanguageStorage {
  read(): Promise<ClientPreferredLanguage | null>;
  write(language: ClientPreferredLanguage): Promise<void>;
}

export interface ClientLanguageDetector {
  detect(): ClientPreferredLanguage;
}

export interface ClientLanguageControllerLogger {
  error(message: string, error: unknown): void;
}

export interface ClientLanguageSnapshot {
  language: ClientPreferredLanguage;
}

type ClientLanguageListener = () => void;

const silentLogger: ClientLanguageControllerLogger = { error() {} };

export class ClientLanguageController {
  private snapshot: ClientLanguageSnapshot;
  private readonly listeners = new Set<ClientLanguageListener>();
  private readonly storage: ClientLanguageStorage;
  private readonly logger: ClientLanguageControllerLogger;
  private loadVersion = 0;
  private mutationVersion = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    storage: ClientLanguageStorage,
    detector: ClientLanguageDetector,
    logger: ClientLanguageControllerLogger = silentLogger,
  ) {
    this.storage = storage;
    this.logger = logger;
    this.snapshot = { language: detector.detect() };
  }

  readonly getSnapshot = (): ClientLanguageSnapshot => this.snapshot;

  readonly subscribe = (listener: ClientLanguageListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async restore(): Promise<void> {
    const loadVersion = ++this.loadVersion;
    const mutationVersion = this.mutationVersion;
    try {
      const stored = await this.storage.read();
      if (
        loadVersion !== this.loadVersion ||
        mutationVersion !== this.mutationVersion ||
        !stored
      ) return;
      this.publish({ language: stored });
    } catch (error) {
      this.logger.error('Unable to restore the client language.', error);
    }
  }

  deactivate(): void {
    this.loadVersion += 1;
  }

  setLanguage(language: ClientPreferredLanguage): void {
    this.mutationVersion += 1;
    if (language !== this.snapshot.language) this.publish({ language });
    const pending = this.writeQueue.then(() => this.storage.write(language));
    this.writeQueue = pending.catch((error: unknown) => {
      this.logger.error('Unable to persist the client language.', error);
    });
  }

  private publish(snapshot: ClientLanguageSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

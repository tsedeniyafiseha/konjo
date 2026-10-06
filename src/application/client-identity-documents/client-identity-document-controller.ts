import type { AuthSession } from '@/application/auth/session-controller';
import type {
  ClientIdentityDocument,
  ClientIdentityDocumentKind,
  ClientIdentityDocumentPicker,
  ClientIdentityDocumentRepository,
  ClientIdentityDocumentRuntime,
  ClientIdentityDocumentStorage,
  PickedClientIdentityDocument,
} from './client-identity-document-contracts';

export interface ClientIdentityDocumentSnapshot {
  available: boolean;
  documents: readonly ClientIdentityDocument[];
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  mutationStatus: 'idle' | 'picking' | 'uploading' | 'deleting';
  error: string | null;
}

export interface ClientIdentityDocumentControllerLogger {
  error(message: string, error: unknown): void;
}

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const silentLogger: ClientIdentityDocumentControllerLogger = { error() {} };

function validate(file: PickedClientIdentityDocument): void {
  if (!IMAGE_TYPES.has(file.mimeType)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.bytes.byteLength !== file.size) {
    throw new Error('The selected document is empty or unreadable.');
  }
  if (file.size > MAX_BYTES) throw new Error('Documents must be 10 MB or smaller.');
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export class ClientIdentityDocumentController {
  private snapshot: ClientIdentityDocumentSnapshot = { available: true, documents: [], loadStatus: 'idle', mutationStatus: 'idle', error: null };
  private readonly listeners = new Set<() => void>();
  private session: AuthSession | null = null;
  private version = 0;
  private mutation: Promise<void> | null = null;
  private readonly repository: ClientIdentityDocumentRepository;
  private readonly storage: ClientIdentityDocumentStorage;
  private readonly picker: ClientIdentityDocumentPicker;
  private readonly runtime: ClientIdentityDocumentRuntime;
  private readonly logger: ClientIdentityDocumentControllerLogger;

  constructor(
    repository: ClientIdentityDocumentRepository,
    storage: ClientIdentityDocumentStorage,
    picker: ClientIdentityDocumentPicker,
    runtime: ClientIdentityDocumentRuntime,
    logger: ClientIdentityDocumentControllerLogger = silentLogger,
    options: { available?: boolean } = {},
  ) {
    this.repository = repository;
    this.storage = storage;
    this.picker = picker;
    this.runtime = runtime;
    this.logger = logger;
    this.snapshot = { ...this.snapshot, available: options.available ?? true };
  }

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  async activate(session: AuthSession | null): Promise<void> {
    const version = ++this.version;
    this.session = session?.role === 'client' ? session : null;
    if (!this.session || !this.snapshot.available) {
      this.publish({ ...this.snapshot, documents: [], loadStatus: 'ready', mutationStatus: 'idle', error: null });
      return;
    }
    this.publish({ ...this.snapshot, loadStatus: 'loading', error: null });
    try {
      const documents = await this.repository.list(this.session.userId);
      if (version !== this.version) return;
      this.publish({ ...this.snapshot, documents, loadStatus: 'ready', mutationStatus: 'idle', error: null });
    } catch (error) {
      this.logger.error('Unable to load client identity documents.', error);
      if (version === this.version) this.publish({ ...this.snapshot, documents: [], loadStatus: 'error', mutationStatus: 'idle', error: message(error, 'Your identity documents could not be loaded.') });
    }
  }

  deactivate(): void { this.version += 1; this.session = null; }
  dismissError(): void { if (this.snapshot.error) this.publish({ ...this.snapshot, error: null }); }

  uploadDocument(kind: ClientIdentityDocumentKind): Promise<void> {
    if (this.mutation) return this.mutation;
    this.mutation = this.performUpload(kind).finally(() => { this.mutation = null; });
    return this.mutation;
  }

  deleteDocument(documentId: string): Promise<void> {
    if (this.mutation) return this.mutation;
    this.mutation = this.performDelete(documentId).finally(() => { this.mutation = null; });
    return this.mutation;
  }

  private async performUpload(kind: ClientIdentityDocumentKind): Promise<void> {
    const version = this.version;
    let uploadedPath: string | null = null;
    try {
      const session = this.requireSession();
      if (this.snapshot.documents.some((document) => document.kind === kind && document.status !== 'rejected')) {
        throw new Error('That identity document is already awaiting review.');
      }
      this.publish({ ...this.snapshot, mutationStatus: 'picking', error: null });
      const file = await this.picker.pick(kind);
      if (version !== this.version) return;
      if (!file) { this.publish({ ...this.snapshot, mutationStatus: 'idle' }); return; }
      validate(file);
      uploadedPath = this.runtime.createStoragePath(session.userId, kind, file.name);
      this.publish({ ...this.snapshot, mutationStatus: 'uploading' });
      await this.storage.upload({ path: uploadedPath, file });
      const document = await this.repository.create({ clientId: session.userId, kind, storagePath: uploadedPath });
      if (version !== this.version) return;
      this.publish({ ...this.snapshot, documents: [document, ...this.snapshot.documents], mutationStatus: 'idle', error: null });
    } catch (error) {
      if (uploadedPath) await this.storage.delete(uploadedPath).catch((cleanup) => this.logger.error('Unable to compensate a client document upload.', cleanup));
      this.logger.error('Unable to upload a client identity document.', error);
      if (version === this.version) this.publish({ ...this.snapshot, mutationStatus: 'idle', error: message(error, 'The identity document could not be uploaded.') });
    }
  }

  private async performDelete(documentId: string): Promise<void> {
    const version = this.version;
    try {
      const session = this.requireSession();
      const document = this.snapshot.documents.find((item) => item.id === documentId);
      if (!document) return;
      if (document.status === 'approved') throw new Error('Approved documents can only be removed by Konjo support.');
      this.publish({ ...this.snapshot, mutationStatus: 'deleting', error: null });
      await this.repository.delete(session.userId, document.id);
      if (version !== this.version) return;
      this.publish({ ...this.snapshot, documents: this.snapshot.documents.filter((item) => item.id !== document.id), mutationStatus: 'idle' });
      await this.storage.delete(document.storagePath).catch((error) => this.logger.error('Unable to remove an orphaned client document object.', error));
    } catch (error) {
      this.logger.error('Unable to delete a client identity document.', error);
      if (version === this.version) this.publish({ ...this.snapshot, mutationStatus: 'idle', error: message(error, 'The identity document could not be deleted.') });
    }
  }

  private requireSession(): AuthSession {
    if (!this.snapshot.available) throw new Error('Identity uploads are not configured. Please contact Konjo support.');
    if (!this.session) throw new Error('Sign in as a client to manage identity documents.');
    return this.session;
  }

  private publish(snapshot: ClientIdentityDocumentSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

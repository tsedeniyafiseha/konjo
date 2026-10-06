import type { AuthSession } from '@/application/auth/session-controller';
import type {
  PickedProfessionalDocument,
  ProfessionalDocument,
  ProfessionalDocumentKind,
  ProfessionalCredentialType,
  ProfessionalDocumentPicker,
  ProfessionalDocumentRepository,
  ProfessionalDocumentRuntime,
  ProfessionalDocumentStorage,
} from '@/application/professional-documents/professional-document-contracts';

export type ProfessionalDocumentLoadStatus = 'idle' | 'loading' | 'ready';
export type ProfessionalDocumentMutationStatus = 'idle' | 'picking' | 'uploading' | 'deleting';

export interface ProfessionalDocumentSnapshot {
  available: boolean;
  documents: readonly ProfessionalDocument[];
  loadStatus: ProfessionalDocumentLoadStatus;
  mutationStatus: ProfessionalDocumentMutationStatus;
  error: string | null;
}

export interface ProfessionalDocumentControllerLogger {
  error(message: string, error: unknown): void;
}

type ProfessionalDocumentListener = () => void;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const CERTIFICATE_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);
const PORTFOLIO_LIMIT = 5;
const PREVIEW_LIFETIME_SECONDS = 60 * 60;
const PREVIEW_REUSE_MS = 50 * 60 * 1000;

const silentLogger: ProfessionalDocumentControllerLogger = { error() {} };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function validateFile(kind: ProfessionalDocumentKind, file: PickedProfessionalDocument): void {
  const allowedMimeTypes = kind === 'certificate' ? CERTIFICATE_MIME_TYPES : IMAGE_MIME_TYPES;
  if (!allowedMimeTypes.has(file.mimeType)) {
    throw new Error(kind === 'certificate'
      ? 'Choose a JPG, PNG, WebP, or PDF document.'
      : 'Choose a JPG, PNG, or WebP image.');
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('The selected document is empty or unreadable.');
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error('Documents must be 10 MB or smaller.');
  }
  if (file.bytes.byteLength !== file.size) {
    throw new Error('The selected document could not be read completely.');
  }
}

export class ProfessionalDocumentController {
  private snapshot: ProfessionalDocumentSnapshot = {
    available: true,
    documents: [],
    loadStatus: 'idle',
    mutationStatus: 'idle',
    error: null,
  };
  private readonly listeners = new Set<ProfessionalDocumentListener>();
  private session: AuthSession | null = null;
  private activationVersion = 0;
  private mutation: Promise<void> | null = null;
  private readonly repository: ProfessionalDocumentRepository;
  private readonly storage: ProfessionalDocumentStorage;
  private readonly picker: ProfessionalDocumentPicker;
  private readonly runtime: ProfessionalDocumentRuntime;
  private readonly logger: ProfessionalDocumentControllerLogger;
  private readonly available: boolean;
  private readonly previews = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    repository: ProfessionalDocumentRepository,
    storage: ProfessionalDocumentStorage,
    picker: ProfessionalDocumentPicker,
    runtime: ProfessionalDocumentRuntime,
    logger: ProfessionalDocumentControllerLogger = silentLogger,
    options: { available?: boolean } = {},
  ) {
    this.repository = repository;
    this.storage = storage;
    this.picker = picker;
    this.runtime = runtime;
    this.logger = logger;
    this.available = options.available ?? true;
    this.snapshot = { ...this.snapshot, available: this.available };
  }

  readonly getSnapshot = (): ProfessionalDocumentSnapshot => this.snapshot;

  readonly subscribe = (listener: ProfessionalDocumentListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async activate(session: AuthSession | null): Promise<void> {
    const version = ++this.activationVersion;
    this.session = session?.role === 'professional' ? session : null;
    if (!this.session || !this.available) {
      this.publish({
        available: this.available,
        documents: [],
        loadStatus: 'ready',
        mutationStatus: 'idle',
        error: null,
      });
      return;
    }

    this.publish({ ...this.snapshot, loadStatus: 'loading', error: null });
    try {
      const documents = await this.repository.list(this.session.userId);
      if (version !== this.activationVersion) return;
      this.publish({
        available: this.available,
        documents,
        loadStatus: 'ready',
        mutationStatus: 'idle',
        error: null,
      });
    } catch (error) {
      this.logger.error('Unable to load professional documents.', error);
      if (version !== this.activationVersion) return;
      this.publish({
        available: this.available,
        documents: [],
        loadStatus: 'ready',
        mutationStatus: 'idle',
        error: errorMessage(error, 'Your documents could not be loaded.'),
      });
    }
  }

  deactivate(): void {
    this.activationVersion += 1;
    this.session = null;
  }

  uploadDocument(kind: ProfessionalDocumentKind, credentialType?: ProfessionalCredentialType): Promise<void> {
    if (this.mutation) return this.mutation;
    this.mutation = this.performUpload(kind, credentialType).finally(() => {
      this.mutation = null;
    });
    return this.mutation;
  }

  deleteDocument(documentId: string): Promise<void> {
    if (this.mutation) return this.mutation;
    this.mutation = this.performDelete(documentId).finally(() => {
      this.mutation = null;
    });
    return this.mutation;
  }

  dismissError(): void {
    if (this.snapshot.error) this.publish({ ...this.snapshot, error: null });
  }

  /** Returns a cached short-lived URL for one of the signed-in owner's images. */
  async previewUrl(documentId: string, now: number = Date.now()): Promise<string | null> {
    const document = this.snapshot.documents.find((item) => item.id === documentId);
    if (!document || !this.session || !this.storage.createPreviewUrl) return null;
    if (document.storagePath.toLowerCase().endsWith('.pdf')) return null;
    const cached = this.previews.get(document.storagePath);
    if (cached && cached.expiresAt > now) return cached.url;
    try {
      const url = await this.storage.createPreviewUrl(document.storagePath, PREVIEW_LIFETIME_SECONDS);
      this.previews.set(document.storagePath, { url, expiresAt: now + PREVIEW_REUSE_MS });
      return url;
    } catch (error) {
      this.logger.error('Unable to create a private document preview.', error);
      return null;
    }
  }

  private async performUpload(kind: ProfessionalDocumentKind, credentialType?: ProfessionalCredentialType): Promise<void> {
    const version = this.activationVersion;
    try {
      const session = this.requireSession();
      this.assertUploadAllowed(kind);
      this.publish({ ...this.snapshot, mutationStatus: 'picking', error: null });
      const file = await this.picker.pick(kind);
      if (version !== this.activationVersion) return;
      if (!file) {
        this.publish({ ...this.snapshot, mutationStatus: 'idle' });
        return;
      }
      validateFile(kind, file);
      const storagePath = this.runtime.createStoragePath(
        session.userId,
        kind,
        file.name,
      );
      this.publish({ ...this.snapshot, mutationStatus: 'uploading' });
      await this.storage.upload({ path: storagePath, file });

      if (version !== this.activationVersion) {
        await this.compensateUpload(storagePath);
        return;
      }

      let document: ProfessionalDocument;
      try {
        document = await this.repository.create({
          professionalId: session.userId,
          kind,
          credentialType,
          storagePath,
        });
      } catch (error) {
        await this.compensateUpload(storagePath);
        throw error;
      }

      if (version !== this.activationVersion) return;
      this.publish({
        ...this.snapshot,
        documents: [document, ...this.snapshot.documents],
        mutationStatus: 'idle',
        error: null,
      });
    } catch (error) {
      this.logger.error('Unable to upload the professional document.', error);
      if (version !== this.activationVersion) return;
      this.publish({
        ...this.snapshot,
        mutationStatus: 'idle',
        error: errorMessage(error, 'The document could not be uploaded.'),
      });
    }
  }

  private assertUploadAllowed(kind: ProfessionalDocumentKind): void {
    if (!this.available) {
      throw new Error('Secure professional document storage is not configured.');
    }
    const active = this.snapshot.documents.filter((document) => (
      document.kind === kind && document.status !== 'rejected'
    ));
    if (['government_id', 'national_id_front', 'national_id_back', 'selfie'].includes(kind) && active.length > 0) {
      const label = kind === 'national_id_front'
        ? 'ID front'
        : kind === 'national_id_back'
          ? 'ID back'
          : kind === 'government_id' ? 'government ID' : 'verification selfie';
      throw new Error(`Your ${label} is already awaiting review.`);
    }
    if (kind === 'portfolio' && active.length >= PORTFOLIO_LIMIT) {
      throw new Error(`You can keep up to ${PORTFOLIO_LIMIT} portfolio photos. Remove one to add another.`);
    }
  }

  private async performDelete(documentId: string): Promise<void> {
    const version = this.activationVersion;
    try {
      const session = this.requireSession();
      const document = this.snapshot.documents.find((item) => item.id === documentId);
      if (!document) return;
      if (document.status === 'approved' && document.kind !== 'portfolio') {
        throw new Error('Approved documents can only be removed by Konjo support.');
      }
      this.publish({ ...this.snapshot, mutationStatus: 'deleting', error: null });
      await this.repository.delete(session.userId, document.id);
      if (version !== this.activationVersion) return;
      this.publish({
        ...this.snapshot,
        documents: this.snapshot.documents.filter((item) => item.id !== document.id),
        mutationStatus: 'idle',
      });
      this.previews.delete(document.storagePath);
      try {
        await this.storage.delete(document.storagePath);
      } catch (error) {
        // The private orphan is safer than restoring a deleted review record.
        // Operations can remove it during storage reconciliation.
        this.logger.error('Unable to remove an orphaned professional document object.', error);
      }
    } catch (error) {
      this.logger.error('Unable to delete the professional document.', error);
      if (version !== this.activationVersion) return;
      this.publish({
        ...this.snapshot,
        mutationStatus: 'idle',
        error: errorMessage(error, 'The document could not be deleted.'),
      });
    }
  }

  private async compensateUpload(storagePath: string): Promise<void> {
    try {
      await this.storage.delete(storagePath);
    } catch (cleanupError) {
      this.logger.error('Unable to compensate a professional document upload.', cleanupError);
    }
  }

  private requireSession(): AuthSession {
    if (!this.session) throw new Error('Sign in as a professional to manage documents.');
    return this.session;
  }

  private publish(snapshot: ProfessionalDocumentSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

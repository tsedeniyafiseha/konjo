import type { AuthSession } from '@/application/auth/session-controller';
import type {
  AdminDocumentDecision,
  AdminDocumentPreviewGateway,
  AdminDocumentRepository,
  AdminDocumentViewer,
  AdminReviewDocument,
} from '@/application/admin-documents/admin-document-contracts';

export interface AdminDocumentSnapshot {
  documents: readonly AdminReviewDocument[];
  loadStatus: 'idle' | 'loading' | 'ready';
  activeDocumentId: string | null;
  error: string | null;
}

export interface AdminDocumentControllerLogger {
  error(message: string, error: unknown): void;
}

type AdminDocumentListener = () => void;

const PREVIEW_LIFETIME_SECONDS = 60;
const THUMBNAIL_LIFETIME_SECONDS = 10 * 60;
const silentLogger: AdminDocumentControllerLogger = { error() {} };

function displayError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export class AdminDocumentController {
  private snapshot: AdminDocumentSnapshot = {
    documents: [],
    loadStatus: 'idle',
    activeDocumentId: null,
    error: null,
  };
  private readonly listeners = new Set<AdminDocumentListener>();
  private readonly repository: AdminDocumentRepository;
  private readonly previews: AdminDocumentPreviewGateway;
  private readonly viewer: AdminDocumentViewer;
  private readonly logger: AdminDocumentControllerLogger;
  private session: AuthSession | null = null;
  private activationVersion = 0;
  private operation: Promise<void> | null = null;
  private readonly thumbnails = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    repository: AdminDocumentRepository,
    previews: AdminDocumentPreviewGateway,
    viewer: AdminDocumentViewer,
    logger: AdminDocumentControllerLogger = silentLogger,
  ) {
    this.repository = repository;
    this.previews = previews;
    this.viewer = viewer;
    this.logger = logger;
  }

  readonly getSnapshot = (): AdminDocumentSnapshot => this.snapshot;

  readonly subscribe = (listener: AdminDocumentListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async activate(session: AuthSession | null): Promise<void> {
    this.session = session?.role === 'admin' ? session : null;
    const version = ++this.activationVersion;
    if (!this.session) {
      this.publish({
        documents: [],
        loadStatus: 'ready',
        activeDocumentId: null,
        error: null,
      });
      return;
    }
    await this.load(version);
  }

  deactivate(): void {
    this.activationVersion += 1;
    this.session = null;
  }

  refresh(): Promise<void> {
    if (!this.session) {
      this.publish({ ...this.snapshot, error: 'Sign in as an administrator to review documents.' });
      return Promise.resolve();
    }
    return this.load(this.activationVersion);
  }

  previewDocument(documentId: string): Promise<void> {
    return this.runOperation(documentId, async (document) => {
      const target = this.viewer.prepare();
      try {
        const url = await this.previews.createSignedPreview(
          document.storagePath,
          PREVIEW_LIFETIME_SECONDS,
          document.storageBucket,
        );
        await target.open(url);
      } catch (error) {
        target.cancel();
        throw error;
      }
    }, 'The private document preview could not be opened.');
  }

  reviewDocument(
    documentId: string,
    decision: AdminDocumentDecision,
    rejectionReason?: string,
  ): Promise<void> {
    const normalizedReason = rejectionReason?.trim();
    if (decision === 'rejected' && (!normalizedReason || normalizedReason.length < 10)) {
      this.publish({
        ...this.snapshot,
        error: 'Add a rejection reason of at least 10 characters.',
      });
      return Promise.resolve();
    }
    return this.runOperation(documentId, async (document) => {
      await this.repository.review({
        documentId,
        ownerRole: document.ownerRole ?? 'professional',
        decision,
        ...(decision === 'rejected' ? { rejectionReason: normalizedReason } : {}),
      });
      this.publish({
        ...this.snapshot,
        documents: this.snapshot.documents.filter((item) => item.id !== documentId),
      });
    }, 'The document decision could not be saved.');
  }

  dismissError(): void {
    if (this.snapshot.error) this.publish({ ...this.snapshot, error: null });
  }

  /** Signed URL for an application's private image, cached for inline thumbnails. */
  async applicationImageUrl(storagePath: string, now: number = Date.now()): Promise<string | null> {
    if (!this.session) return null;
    const cached = this.thumbnails.get(storagePath);
    if (cached && cached.expiresAt > now) return cached.url;
    try {
      const url = await this.previews.createSignedPreview(
        storagePath,
        THUMBNAIL_LIFETIME_SECONDS,
        'professional-documents',
      );
      this.thumbnails.set(storagePath, { url, expiresAt: now + (THUMBNAIL_LIFETIME_SECONDS - 60) * 1000 });
      return url;
    } catch (error) {
      this.logger.error('Unable to create an application image preview.', error);
      return null;
    }
  }

  private async load(version: number): Promise<void> {
    this.publish({ ...this.snapshot, loadStatus: 'loading', error: null });
    try {
      const documents = await this.repository.listPending();
      if (version !== this.activationVersion) return;
      this.publish({
        documents,
        loadStatus: 'ready',
        activeDocumentId: null,
        error: null,
      });
    } catch (error) {
      this.logger.error('Unable to load the administrator document queue.', error);
      if (version !== this.activationVersion) return;
      this.publish({
        ...this.snapshot,
        loadStatus: 'ready',
        activeDocumentId: null,
        error: displayError(error, 'The document review queue could not be loaded.'),
      });
    }
  }

  private runOperation(
    documentId: string,
    action: (document: AdminReviewDocument) => Promise<void>,
    fallback: string,
  ): Promise<void> {
    if (this.operation) return this.operation;
    const version = this.activationVersion;
    this.operation = (async () => {
      try {
        this.requireAdmin();
        const document = this.snapshot.documents.find((item) => item.id === documentId);
        if (!document) throw new Error('This document is no longer awaiting review.');
        this.publish({ ...this.snapshot, activeDocumentId: documentId, error: null });
        await action(document);
        if (version !== this.activationVersion) return;
        this.publish({ ...this.snapshot, activeDocumentId: null });
      } catch (error) {
        this.logger.error(fallback, error);
        if (version !== this.activationVersion) return;
        this.publish({
          ...this.snapshot,
          activeDocumentId: null,
          error: displayError(error, fallback),
        });
      }
    })().finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  private requireAdmin(): void {
    if (!this.session) throw new Error('Sign in as an administrator to review documents.');
  }

  private publish(snapshot: AdminDocumentSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

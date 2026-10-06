import assert from 'node:assert/strict';

import type { AuthSession } from '../../src/application/auth/session-controller.ts';
import { AdminDocumentController } from '../../src/application/admin-documents/admin-document-controller.ts';
import type {
  AdminDocumentPreviewGateway,
  AdminDocumentRepository,
  AdminDocumentViewer,
  AdminReviewDocument,
} from '../../src/application/admin-documents/admin-document-contracts.ts';

const session: AuthSession = {
  userId: 'admin-1',
  expiresAt: Date.now() + 60_000,
  source: 'api',
  role: 'admin',
  authMethod: 'email_password',
  accessToken: 'admin-token',
};

const document: AdminReviewDocument = {
  id: 'document-1',
  ownerId: 'professional-1',
  ownerName: 'Professional One',
  ownerRole: 'professional',
  kind: 'certificate',
  storageBucket: 'professional-documents',
  storagePath: 'professional-1/certificate/diploma.pdf',
  status: 'pending',
  rejectionReason: null,
  createdAt: '2026-09-18T12:00:00.000Z',
};

function dependencies(overrides: {
  repository?: Partial<AdminDocumentRepository>;
  previews?: Partial<AdminDocumentPreviewGateway>;
  viewer?: Partial<AdminDocumentViewer>;
} = {}) {
  const calls: string[] = [];
  const repository: AdminDocumentRepository = {
    async listPending() { calls.push('list'); return [document]; },
    async review(input) {
      calls.push(`review:${input.documentId}:${input.decision}:${input.rejectionReason ?? ''}`);
    },
    ...overrides.repository,
  };
  const previews: AdminDocumentPreviewGateway = {
    async createSignedPreview(path, expiresInSeconds) {
      calls.push(`sign:${path}:${expiresInSeconds}`);
      return 'https://storage.test/signed-preview';
    },
    ...overrides.previews,
  };
  const viewer: AdminDocumentViewer = {
    prepare() {
      calls.push('prepare');
      return {
        async open(url) { calls.push(`open:${url}`); },
        cancel() { calls.push('cancel'); },
      };
    },
    ...overrides.viewer,
  };
  const controller = new AdminDocumentController(repository, previews, viewer);
  return { calls, controller };
}

{
  const { calls, controller } = dependencies();
  await controller.activate(session);
  assert.deepEqual(calls, ['list']);
  assert.deepEqual(controller.getSnapshot().documents, [document]);
  assert.equal(controller.getSnapshot().loadStatus, 'ready');
}

{
  const { calls, controller } = dependencies();
  await controller.activate(session);
  await controller.previewDocument(document.id);
  assert.deepEqual(calls, [
    'list',
    'prepare',
    'sign:professional-1/certificate/diploma.pdf:60',
    'open:https://storage.test/signed-preview',
  ]);
  assert.equal(controller.getSnapshot().activeDocumentId, null);
}

{
  const { calls, controller } = dependencies({
    previews: {
      async createSignedPreview() {
        calls.push('sign-failed');
        throw new Error('Preview failed.');
      },
    },
  });
  await controller.activate(session);
  await controller.previewDocument(document.id);
  assert.deepEqual(calls, ['list', 'prepare', 'sign-failed', 'cancel']);
  assert.equal(controller.getSnapshot().error, 'Preview failed.');
}

{
  const { calls, controller } = dependencies();
  await controller.activate(session);
  await controller.reviewDocument(document.id, 'approved');
  assert.deepEqual(calls, ['list', 'review:document-1:approved:']);
  assert.deepEqual(controller.getSnapshot().documents, []);
}

{
  const { calls, controller } = dependencies();
  await controller.activate(session);
  await controller.reviewDocument(document.id, 'rejected', 'too short');
  assert.deepEqual(calls, ['list']);
  assert.equal(
    controller.getSnapshot().error,
    'Add a rejection reason of at least 10 characters.',
  );
  await controller.reviewDocument(document.id, 'rejected', 'Certificate name is unreadable.');
  assert.deepEqual(calls, [
    'list',
    'review:document-1:rejected:Certificate name is unreadable.',
  ]);
  assert.deepEqual(controller.getSnapshot().documents, []);
}

{
  const { calls, controller } = dependencies();
  await controller.activate({ ...session, role: 'professional' });
  assert.deepEqual(calls, []);
  await controller.previewDocument(document.id);
  assert.equal(
    controller.getSnapshot().error,
    'Sign in as an administrator to review documents.',
  );
}

console.log('Client administrator document controller contracts passed.');

import assert from 'node:assert/strict';

import type { AuthSession } from '../../src/application/auth/session-controller.ts';
import { ProfessionalDocumentController } from '../../src/application/professional-documents/professional-document-controller.ts';
import type {
  PickedProfessionalDocument,
  ProfessionalDocument,
  ProfessionalDocumentPicker,
  ProfessionalDocumentRepository,
  ProfessionalDocumentRuntime,
  ProfessionalDocumentStorage,
} from '../../src/application/professional-documents/professional-document-contracts.ts';

const session: AuthSession = {
  userId: 'professional-1',
  expiresAt: Date.now() + 60_000,
  source: 'api',
  role: 'professional',
  authMethod: 'email_password',
  accessToken: 'token',
};

const existing: ProfessionalDocument = {
  id: 'document-1',
  professionalId: session.userId,
  kind: 'certificate',
  storagePath: 'professional-1/certificate/existing.pdf',
  status: 'pending',
  rejectionReason: null,
  createdAt: '2026-09-18T12:00:00.000Z',
};

function pickedFile(size = 4): PickedProfessionalDocument {
  return {
    name: 'Beauty Diploma.pdf',
    mimeType: 'application/pdf',
    size,
    bytes: new ArrayBuffer(size),
  };
}

function pickedImage(size = 4): PickedProfessionalDocument {
  return {
    name: 'verification.jpg',
    mimeType: 'image/jpeg',
    size,
    bytes: new ArrayBuffer(size),
  };
}

function dependencies(overrides: {
  picker?: Partial<ProfessionalDocumentPicker>;
  repository?: Partial<ProfessionalDocumentRepository>;
  storage?: Partial<ProfessionalDocumentStorage>;
} = {}) {
  const calls: string[] = [];
  const picker: ProfessionalDocumentPicker = {
    async pick(kind) { calls.push(`pick:${kind}`); return pickedFile(); },
    ...overrides.picker,
  };
  const repository: ProfessionalDocumentRepository = {
    async list(professionalId) { calls.push(`list:${professionalId}`); return []; },
    async create(input) {
      calls.push(`create:${input.storagePath}`);
      return { ...existing, id: 'document-2', kind: input.kind, storagePath: input.storagePath };
    },
    async delete(professionalId, documentId) { calls.push(`delete-record:${professionalId}:${documentId}`); },
    ...overrides.repository,
  };
  const storage: ProfessionalDocumentStorage = {
    async upload(input) { calls.push(`upload:${input.path}`); },
    async delete(path) { calls.push(`delete-object:${path}`); },
    ...overrides.storage,
  };
  const runtime: ProfessionalDocumentRuntime = {
    createStoragePath: (_professionalId, kind) => `professional-1/${kind}/new.pdf`,
  };
  const controller = new ProfessionalDocumentController(
    repository,
    storage,
    picker,
    runtime,
  );
  return { calls, controller };
}

{
  const { calls, controller } = dependencies({
    picker: { async pick(kind) { calls.push(`pick:${kind}`); return pickedImage(); } },
  });
  await controller.activate(session);
  await controller.uploadDocument('government_id');
  assert.deepEqual(calls, [
    'list:professional-1',
    'pick:government_id',
    'upload:professional-1/government_id/new.pdf',
    'create:professional-1/government_id/new.pdf',
  ]);
  assert.equal(controller.getSnapshot().documents[0]?.kind, 'government_id');
}

{
  const governmentId = { ...existing, kind: 'government_id' as const };
  const { calls, controller } = dependencies({
    repository: { async list() { return [governmentId]; } },
  });
  await controller.activate(session);
  await controller.uploadDocument('government_id');
  assert.deepEqual(calls, []);
  assert.equal(controller.getSnapshot().error, 'Your government ID is already awaiting review.');
}

{
  const { calls, controller } = dependencies();
  await controller.activate(session);
  await controller.uploadDocument('selfie');
  assert.deepEqual(calls, ['list:professional-1', 'pick:selfie']);
  assert.equal(controller.getSnapshot().error, 'Choose a JPG, PNG, or WebP image.');
}

{
  const { calls, controller } = dependencies();
  const unavailable = new ProfessionalDocumentController(
    {
      async list() { calls.push('unavailable-list'); return []; },
      async create() { throw new Error('not used'); },
      async delete() {},
    },
    { async upload() {}, async delete() {} },
    { async pick() { calls.push('unavailable-pick'); return pickedImage(); } },
    { createStoragePath: () => 'not-used' },
    undefined,
    { available: false },
  );
  await unavailable.activate(session);
  assert.equal(unavailable.getSnapshot().available, false);
  assert.equal(unavailable.getSnapshot().loadStatus, 'ready');
  assert.deepEqual(calls, []);
  await unavailable.uploadDocument('government_id');
  assert.equal(unavailable.getSnapshot().error, 'Secure professional document storage is not configured.');
  assert.deepEqual(calls, []);
}

{
  const { calls, controller } = dependencies({
    repository: { async list() { calls.push('list'); return [existing]; } },
  });
  await controller.activate(session);
  assert.equal(controller.getSnapshot().loadStatus, 'ready');
  assert.deepEqual(controller.getSnapshot().documents, [existing]);
  assert.deepEqual(calls, ['list']);
}

{
  const { calls, controller } = dependencies();
  await controller.activate(session);
  await controller.uploadDocument('certificate');
  assert.deepEqual(calls, [
    'list:professional-1',
    'pick:certificate',
    'upload:professional-1/certificate/new.pdf',
    'create:professional-1/certificate/new.pdf',
  ]);
  assert.equal(controller.getSnapshot().documents[0]?.id, 'document-2');
  assert.equal(controller.getSnapshot().mutationStatus, 'idle');
}

{
  const { calls, controller } = dependencies({
    picker: { async pick() { calls.push('cancel'); return null; } },
  });
  await controller.activate(session);
  await controller.uploadDocument('certificate');
  assert.deepEqual(calls, ['list:professional-1', 'cancel']);
  assert.equal(controller.getSnapshot().error, null);
}

{
  const approved = { ...existing, status: 'approved' as const };
  const { calls, controller } = dependencies({
    repository: { async list() { return [approved]; } },
  });
  await controller.activate(session);
  await controller.deleteDocument(approved.id);
  assert.deepEqual(calls, []);
  assert.equal(
    controller.getSnapshot().error,
    'Approved documents can only be removed by Konjo support.',
  );
  assert.deepEqual(controller.getSnapshot().documents, [approved]);
}

{
  const { calls, controller } = dependencies({
    picker: {
      async pick() {
        calls.push('oversize');
        return pickedFile(10 * 1024 * 1024 + 1);
      },
    },
  });
  await controller.activate(session);
  await controller.uploadDocument('certificate');
  assert.deepEqual(calls, ['list:professional-1', 'oversize']);
  assert.equal(controller.getSnapshot().error, 'Documents must be 10 MB or smaller.');
}

{
  const { calls, controller } = dependencies({
    repository: {
      async create() { calls.push('create-failed'); throw new Error('Record failed.'); },
    },
  });
  await controller.activate(session);
  await controller.uploadDocument('certificate');
  assert.deepEqual(calls, [
    'list:professional-1',
    'pick:certificate',
    'upload:professional-1/certificate/new.pdf',
    'create-failed',
    'delete-object:professional-1/certificate/new.pdf',
  ]);
  assert.equal(controller.getSnapshot().error, 'Record failed.');
}

{
  const { calls, controller } = dependencies({
    repository: { async list() { return [existing]; } },
    storage: {
      async delete(path) { calls.push(`orphan:${path}`); throw new Error('Cleanup failed.'); },
    },
  });
  await controller.activate(session);
  await controller.deleteDocument(existing.id);
  assert.deepEqual(calls, [
    'delete-record:professional-1:document-1',
    'orphan:professional-1/certificate/existing.pdf',
  ]);
  assert.deepEqual(controller.getSnapshot().documents, []);
  assert.equal(controller.getSnapshot().error, null);
}

console.log('Client professional-document controller contracts passed.');

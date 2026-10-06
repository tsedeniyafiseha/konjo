import assert from 'node:assert/strict';

import { ClientIdentityDocumentController } from '../../src/application/client-identity-documents/client-identity-document-controller.ts';
import type {
  ClientIdentityDocument,
  ClientIdentityDocumentPicker,
  ClientIdentityDocumentRepository,
  ClientIdentityDocumentRuntime,
  ClientIdentityDocumentStorage,
} from '../../src/application/client-identity-documents/client-identity-document-contracts.ts';

const calls: string[] = [];
const repository: ClientIdentityDocumentRepository = {
  async list() { calls.push('list'); return []; },
  async create(input) {
    calls.push(`create:${input.kind}`);
    return { id: 'document-1', clientId: input.clientId, kind: input.kind, storagePath: input.storagePath, status: 'pending', rejectionReason: null, createdAt: '2026-09-19T00:00:00.000Z' };
  },
  async delete(_clientId, id) { calls.push(`delete:${id}`); },
};
const storage: ClientIdentityDocumentStorage = {
  async upload(input) { calls.push(`upload:${input.path}`); },
  async delete(path) { calls.push(`storage-delete:${path}`); },
};
const picker: ClientIdentityDocumentPicker = {
  async pick(kind) {
    calls.push(`pick:${kind}`);
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    return { name: 'identity.jpg', mimeType: 'image/jpeg', size: bytes.byteLength, bytes };
  },
};
const runtime: ClientIdentityDocumentRuntime = {
  createStoragePath(clientId, kind, name) { return `${clientId}/${kind}/${name}`; },
};

const controller = new ClientIdentityDocumentController(repository, storage, picker, runtime);
await controller.activate({ userId: 'client-1', role: 'client', source: 'api', authMethod: 'phone_otp', accessToken: 'token', expiresAt: Date.now() + 60_000 });
await controller.uploadDocument('passport');
assert.deepEqual(calls, ['list', 'pick:passport', 'upload:client-1/passport/identity.jpg', 'create:passport']);
assert.equal(controller.getSnapshot().documents[0]?.kind, 'passport');

await controller.uploadDocument('passport');
assert.match(controller.getSnapshot().error ?? '', /already awaiting review/);

const approved: ClientIdentityDocument = { ...controller.getSnapshot().documents[0]!, status: 'approved' };
const approvedController = new ClientIdentityDocumentController({ ...repository, async list() { return [approved]; } }, storage, picker, runtime);
await approvedController.activate({ userId: 'client-1', role: 'client', source: 'api', authMethod: 'phone_otp', accessToken: 'token', expiresAt: Date.now() + 60_000 });
await approvedController.deleteDocument(approved.id);
assert.match(approvedController.getSnapshot().error ?? '', /Approved documents/);

console.log('Client identity-document controller contracts passed.');

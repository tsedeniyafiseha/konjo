import assert from 'node:assert/strict';

import {
  SessionController,
  type AuthSession,
  type ExternalSessionSource,
  type SessionControllerLogger,
  type SessionRevocationGateway,
  type SessionStorage,
} from '../../src/application/auth/session-controller.ts';

const session: AuthSession = {
  userId: 'client-1',
  expiresAt: 2_000_000_000_000,
  source: 'api',
  role: 'client',
  authMethod: 'phone_otp',
  accessToken: 'access-token',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

{
  let stored: AuthSession | null = session;
  let notifications = 0;
  const storage: SessionStorage = {
    async read() { return stored; },
    async write(value) { stored = value; },
    async clear() { stored = null; },
  };
  const gateway: SessionRevocationGateway = { async revoke() {} };
  const controller = new SessionController(storage, gateway);
  const unsubscribe = controller.subscribe(() => { notifications += 1; });

  await controller.restore();
  assert.deepEqual(controller.getSnapshot(), { session, status: 'authenticated' });
  assert.equal(notifications, 1);
  unsubscribe();
}

{
  const write = deferred<void>();
  const storage: SessionStorage = {
    async read() { return null; },
    async write() { await write.promise; },
    async clear() {},
  };
  const controller = new SessionController(storage, { async revoke() {} });
  await controller.restore();
  const signingIn = controller.completeSignIn(session);
  assert.equal(controller.getSnapshot().status, 'unauthenticated');
  write.resolve();
  await signingIn;
  assert.deepEqual(controller.getSnapshot(), { session, status: 'authenticated' });
}

{
  const restored = deferred<AuthSession | null>();
  let persisted: AuthSession | null = null;
  const storage: SessionStorage = {
    async read() { return restored.promise; },
    async write(value) { persisted = value; },
    async clear() { persisted = null; },
  };
  const controller = new SessionController(storage, { async revoke() {} });
  const restoring = controller.restore();
  await controller.completeSignIn(session);
  restored.resolve(null);
  await restoring;
  assert.equal(persisted, session);
  assert.deepEqual(controller.getSnapshot(), { session, status: 'authenticated' });
}

{
  let cleared = false;
  const errors: Array<{ message: string; error: unknown }> = [];
  const logger: SessionControllerLogger = {
    error(message, error) { errors.push({ message, error }); },
  };
  const storage: SessionStorage = {
    async read() { return session; },
    async write() {},
    async clear() { cleared = true; },
  };
  const controller = new SessionController(
    storage,
    { async revoke() { throw new Error('provider unavailable'); } },
    logger,
  );
  await controller.restore();
  await controller.signOut();
  assert.equal(cleared, true);
  assert.deepEqual(controller.getSnapshot(), { session: null, status: 'unauthenticated' });
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /revoke/);
}

{
  const revocation = deferred<void>();
  const replacementSession: AuthSession = {
    ...session,
    userId: 'client-2',
    accessToken: 'replacement-token',
  };
  let stored: AuthSession | null = session;
  const storage: SessionStorage = {
    async read() { return stored; },
    async write(value) { stored = value; },
    async clear() { stored = null; },
  };
  const controller = new SessionController(storage, {
    async revoke() { await revocation.promise; },
  });
  await controller.restore();
  const signingOut = controller.signOut();
  const signingIn = controller.completeSignIn(replacementSession);
  revocation.resolve();
  await Promise.all([signingOut, signingIn]);
  assert.equal(stored, replacementSession);
  assert.deepEqual(controller.getSnapshot(), {
    session: replacementSession,
    status: 'authenticated',
  });
}

{
  const errors: Array<string> = [];
  const controller = new SessionController(
    {
      async read() { throw new Error('corrupt storage'); },
      async write() {},
      async clear() {},
    },
    { async revoke() {} },
    { error(message) { errors.push(message); } },
  );
  await controller.restore();
  assert.deepEqual(controller.getSnapshot(), { session: null, status: 'unauthenticated' });
  assert.equal(errors.length, 1);
}

{
  const refreshedSession: AuthSession = {
    ...session,
    accessToken: 'refreshed-access-token',
    expiresAt: session.expiresAt + 3_600_000,
  };
  let emitExternalSession: (value: AuthSession | null) => void = () => {
    throw new Error('External session source is not active.');
  };
  let subscriptions = 0;
  let cancellations = 0;
  let stored: AuthSession | null = null;
  const published = deferred<void>();
  const externalSessions: ExternalSessionSource = {
    subscribe(listener) {
      subscriptions += 1;
      emitExternalSession = listener;
      return () => { cancellations += 1; };
    },
  };
  const controller = new SessionController(
    {
      async read() { return null; },
      async write(value) { stored = value; },
      async clear() { stored = null; },
    },
    { async revoke() {} },
    undefined,
    externalSessions,
  );
  controller.subscribe(() => {
    if (controller.getSnapshot().session?.accessToken === refreshedSession.accessToken) {
      published.resolve();
    }
  });

  controller.activate();
  controller.activate();
  assert.equal(subscriptions, 1);
  emitExternalSession(refreshedSession);
  await published.promise;
  assert.equal(stored, refreshedSession);
  assert.deepEqual(controller.getSnapshot(), {
    session: refreshedSession,
    status: 'authenticated',
  });

  controller.deactivate();
  controller.deactivate();
  assert.equal(cancellations, 1);
}

console.log('Client session controller contracts passed.');

import assert from 'node:assert/strict';

import {
  ClientLanguageController,
  type ClientLanguageControllerLogger,
  type ClientLanguageStorage,
} from '../../src/application/language/client-language-controller.ts';
import type { ClientPreferredLanguage } from '../../src/application/client-account/client-account-contracts.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function storage(overrides: Partial<ClientLanguageStorage> = {}): ClientLanguageStorage {
  return {
    async read() { return null; },
    async write() {},
    ...overrides,
  };
}

function controller(
  languageStorage: ClientLanguageStorage,
  detected: ClientPreferredLanguage = 'en',
  logger?: ClientLanguageControllerLogger,
) {
  return new ClientLanguageController(
    languageStorage,
    { detect: () => detected },
    logger,
  );
}

{
  const language = controller(storage({ async read() { return 'am'; } }));
  assert.equal(language.getSnapshot().language, 'en');
  await language.restore();
  assert.equal(language.getSnapshot().language, 'am');
}

{
  const stored = deferred<ClientPreferredLanguage | null>();
  const writes: ClientPreferredLanguage[] = [];
  const language = controller(storage({
    async read() { return stored.promise; },
    async write(value) { writes.push(value); },
  }));
  const restoring = language.restore();
  language.setLanguage('en');
  stored.resolve('am');
  await restoring;
  await Promise.resolve();
  assert.equal(language.getSnapshot().language, 'en');
  assert.deepEqual(writes, ['en']);
}

{
  const firstWrite = deferred<void>();
  const secondWriteStarted = deferred<void>();
  const writes: ClientPreferredLanguage[] = [];
  const language = controller(storage({
    async write(value) {
      writes.push(value);
      if (writes.length === 1) await firstWrite.promise;
      else secondWriteStarted.resolve();
    },
  }));
  language.setLanguage('am');
  language.setLanguage('en');
  await Promise.resolve();
  assert.deepEqual(writes, ['am']);
  firstWrite.resolve();
  await secondWriteStarted.promise;
  assert.deepEqual(writes, ['am', 'en']);
  assert.equal(language.getSnapshot().language, 'en');
}

{
  const stored = deferred<ClientPreferredLanguage | null>();
  const language = controller(storage({ async read() { return stored.promise; } }));
  const restoring = language.restore();
  language.deactivate();
  stored.resolve('am');
  await restoring;
  assert.equal(language.getSnapshot().language, 'en');
}

{
  const errors: string[] = [];
  const writeErrorLogged = deferred<void>();
  const logger: ClientLanguageControllerLogger = {
    error(message) {
      errors.push(message);
      if (message === 'Unable to persist the client language.') writeErrorLogged.resolve();
    },
  };
  const language = controller(storage({
    async read() { throw new Error('read failed'); },
    async write() { throw new Error('write failed'); },
  }), 'am', logger);
  await language.restore();
  language.setLanguage('en');
  await writeErrorLogged.promise;
  assert.equal(language.getSnapshot().language, 'en');
  assert.deepEqual(errors, [
    'Unable to restore the client language.',
    'Unable to persist the client language.',
  ]);
}

console.log('Client language controller contract tests passed.');

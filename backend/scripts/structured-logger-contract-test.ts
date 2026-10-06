import assert from 'node:assert/strict';

import { createStructuredLogger } from '../src/adapters/structured-logger.ts';

const lines: Array<{ level: string; line: string }> = [];
const logger = createStructuredLogger({
  level: 'info',
  clock: { now: () => new Date('2026-09-18T12:00:00.000Z') },
  write: (level, line) => lines.push({ level, line }),
});

logger.info('request_completed', { requestId: 'request-1', status: 200 });
logger.error('worker_failed', { requestId: 'request-2' });

assert.deepEqual(lines.map(({ level, line }) => ({ level, payload: JSON.parse(line) })), [
  {
    level: 'info',
    payload: {
      timestamp: '2026-09-18T12:00:00.000Z',
      level: 'info',
      event: 'request_completed',
      details: { requestId: 'request-1', status: 200 },
    },
  },
  {
    level: 'error',
    payload: {
      timestamp: '2026-09-18T12:00:00.000Z',
      level: 'error',
      event: 'worker_failed',
      details: { requestId: 'request-2' },
    },
  },
]);

const errorOnly: string[] = [];
const filteredLogger = createStructuredLogger({
  level: 'error',
  clock: { now: () => new Date('2026-09-18T12:00:00.000Z') },
  write: (_level, line) => errorOnly.push(line),
});
filteredLogger.info('hidden');
filteredLogger.error('visible');
assert.equal(errorOnly.length, 1);
assert.equal(JSON.parse(errorOnly[0]).event, 'visible');

console.log('Structured logger adapter contract passed.');

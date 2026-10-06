import { createHash } from 'node:crypto';

import type { PayloadHasher } from '../application/ports.ts';

export const sha256PayloadHasher: PayloadHasher = {
  hash(value) {
    return createHash('sha256').update(value).digest('hex');
  },
};

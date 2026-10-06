import type { AccountAssetCleaner } from '../application/ports.ts';

export class EmptyAccountAssetCleaner implements AccountAssetCleaner {
  async deletePrivateAssets(): Promise<void> {}
}

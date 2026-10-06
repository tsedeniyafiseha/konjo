import type { ProfessionalPortfolioReadStore } from './ports.ts';

export class ReadProfessionalPortfolio {
  private readonly store: ProfessionalPortfolioReadStore;

  constructor(store: ProfessionalPortfolioReadStore) {
    this.store = store;
  }

  listApproved(professionalId: string) {
    return this.store.listApprovedPortfolio(professionalId);
  }

  async listFeed(limit: number) {
    return this.store.listPortfolioFeed ? await this.store.listPortfolioFeed(limit) : [];
  }
}

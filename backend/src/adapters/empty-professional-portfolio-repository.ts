import type { ProfessionalPortfolioReadStore } from '../application/ports.ts';

export class EmptyProfessionalPortfolioRepository implements ProfessionalPortfolioReadStore {
  async listApprovedPortfolio() {
    return [];
  }
}

import type { ReadinessProbe } from './ports.ts';

export class CheckReadiness {
  private readonly probe: ReadinessProbe;

  constructor(probe: ReadinessProbe) {
    this.probe = probe;
  }

  async execute(): Promise<boolean> {
    try {
      await this.probe.check();
      return true;
    } catch {
      return false;
    }
  }
}

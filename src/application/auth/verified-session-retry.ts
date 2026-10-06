/** A consumed one-time code must not be exchanged again after a later step fails.
 * The cached proof is memory-only and reusable only while that session is active.
 */
export class VerifiedSessionRetry<Session> {
  private proof: { key: string; session: Session } | null = null;

  clear(): void { this.proof = null; }

  async resolve<T>(key: string, exchange: () => Promise<Session>, isActive: (session: Session) => Promise<boolean>, next: (session: Session) => Promise<T>): Promise<T> {
    if (!this.proof || this.proof.key !== key || !await isActive(this.proof.session)) {
      this.proof = null;
      const session = await exchange();
      this.proof = { key, session };
    }
    return next(this.proof.session);
  }
}

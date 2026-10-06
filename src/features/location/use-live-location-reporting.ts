import { useEffect, useState } from 'react';

import type { ProfessionalJob } from '@/application/professional-data/professional-data-contracts';
import { useAuthSession } from '@/features/auth/session-context';
import { type LiveLocationPermission, liveLocationReporter } from './live-location-reporter';

/**
 * Keeps location sharing on exactly while one of the professional's jobs is
 * "on the way" and they have not yet tapped Arrived; off otherwise (arrival,
 * check-out, cancellation, sign-out).
 */
export function useLiveLocationReporting(jobs: readonly ProfessionalJob[]): { sharing: boolean; permission: LiveLocationPermission | null } {
  const { session } = useAuthSession();
  const liveJob = jobs.find((job) => job.status === 'traveling' && !job.arrivedAt) ?? null;
  const liveJobId = liveJob?.id ?? null;
  const token = session?.source === 'api' ? session.accessToken ?? null : null;
  const userId = session?.userId ?? null;
  const [outcome, setOutcome] = useState<{ jobId: string; permission: LiveLocationPermission } | null>(null);

  useEffect(() => {
    if (!liveJobId || !token || !userId) {
      void liveLocationReporter.stop();
      return;
    }
    let cancelled = false;
    void liveLocationReporter.start(liveJobId, token, userId).then((result) => {
      if (!cancelled) setOutcome({ jobId: liveJobId, permission: result });
    });
    return () => { cancelled = true; };
  }, [liveJobId, token, userId]);

  useEffect(() => () => { void liveLocationReporter.stop(); }, []);

  const permission = liveJobId && outcome?.jobId === liveJobId ? outcome.permission : null;
  return { sharing: Boolean(liveJobId) && permission === 'granted', permission };
}

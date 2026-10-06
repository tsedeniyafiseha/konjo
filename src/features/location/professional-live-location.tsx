import { useProfessionalData } from '@/features/professional/professional-data-context';
import { useLiveLocationReporting } from './use-live-location-reporting';

/** Mounted once under the professional layout so sharing follows the active job. */
export function ProfessionalLiveLocation() {
  const { activeJob, upcomingJobs } = useProfessionalData();
  useLiveLocationReporting(activeJob ? [activeJob, ...upcomingJobs] : upcomingJobs);
  return null;
}

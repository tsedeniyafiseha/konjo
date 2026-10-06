import type {
  ProfessionalDataGateway,
  ProfessionalDataRuntime,
  ProfessionalDataScheduler,
} from '@/application/professional-data/professional-data-controller';
import { professionalDashboardService } from '@/features/professional/professional-dashboard-service';

export const apiProfessionalDataGateway: ProfessionalDataGateway = {
  loadDashboard: (accessToken) => professionalDashboardService.getDashboard(accessToken),
  setAvailability: (accessToken, available) => (
    professionalDashboardService.setAvailability(accessToken, available)
  ),
  loadCatalog: (accessToken) => professionalDashboardService.getCatalog(accessToken),
  updateCatalog: (accessToken, settings) => (
    professionalDashboardService.updateCatalog(accessToken, settings)
  ),
  // The travel fee the professional names on acceptance must reach the API,
  // or the booking is accepted with the request's zero fee.
  transitionBooking: (accessToken, bookingId, action, options) => (
    professionalDashboardService.transitionBooking(accessToken, bookingId, action, options)
  ),
};

export const systemProfessionalDataScheduler: ProfessionalDataScheduler = {
  every(milliseconds, task) {
    const interval = setInterval(task, milliseconds);
    return () => clearInterval(interval);
  },
  after(milliseconds, task) {
    const timeout = setTimeout(task, milliseconds);
    return () => clearTimeout(timeout);
  },
};

export const systemProfessionalDataRuntime: ProfessionalDataRuntime = {
  now: () => Date.now(),
  dateLabel(dateIso) {
    const date = new Date(`${dateIso}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? dateIso
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
};

import { NotificationInboxScreen } from '@/features/notifications/notification-inbox-screen';
import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import { resolveProfessionalLanguage } from '@/localization/use-professional-copy';

export default function ProfessionalNotificationsRoute() {
  const { application, draft } = useProfessionalRegistration();
  return <NotificationInboxScreen language={resolveProfessionalLanguage(application, draft)} />;
}

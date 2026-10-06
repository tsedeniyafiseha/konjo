import { NotificationInboxScreen } from '@/features/notifications/notification-inbox-screen';
import { useClientCopy } from '@/localization/use-client-copy';

export default function ClientNotificationsRoute() {
  const { language } = useClientCopy();
  return <NotificationInboxScreen language={language} />;
}

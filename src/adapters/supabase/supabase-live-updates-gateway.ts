import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/services/supabase-database.types';
import type { LiveUpdatesGateway } from '@/application/live-updates/live-updates-gateway';

export function createSupabaseLiveUpdatesGateway(client: SupabaseClient<Database> | null): LiveUpdatesGateway {
  return {
    subscribe(table, column, id, refresh) {
      if (!client) return () => {};
      const channel = client.channel(`${table}:${id}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, ...(id ? { filter: `${column}=eq.${id}` } : {}) }, refresh)
        .subscribe();
      return () => { void client.removeChannel(channel); };
    },
    async markNotificationsRead(ids) {
      if (!client || !ids.length) return;
      const { error } = await client.rpc('mark_my_notifications_read', { p_notification_ids: [...ids] });
      if (error) throw new Error('Notifications could not be marked read.');
    },
  };
}

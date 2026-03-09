import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  created_at: string;
  deleted_at: string | null;
}

export function useNotifications(filter: 'all' | 'unread' | 'read' = 'all') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id, filter],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('notifications', {
        body: { action: 'list', actor_id: user!.id, filter },
      });
      if (error) throw error;
      return (data.notifications || []) as Notification[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications-unread-count', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('notifications', {
        body: { action: 'unread_count', actor_id: user!.id },
      });
      if (error) throw error;
      return (data.count || 0) as number;
    },
    enabled: !!user?.id,
    refetchInterval: 15_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (notificationId?: string) => {
      const { data, error } = await supabase.functions.invoke('notifications', {
        body: {
          action: 'mark_read',
          actor_id: user!.id,
          notification_id: notificationId,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });
}

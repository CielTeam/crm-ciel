import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  playMessageSound,
  playTaskSound,
  playNotificationSound,
  requestNotificationPermission,
  showBrowserNotification,
} from '@/lib/notifications';
import { readSoundPreferences } from '@/hooks/useSoundPreferences';

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

interface BroadcastPayload {
  id?: string;
  type: string;
  title: string;
  body?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
}

/** Get the currently active conversation id from the URL */
function getActiveConversationId(): string | null {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('conversation');
  } catch {
    return null;
  }
}

export function useNotifications(filter: 'all' | 'unread' | 'read' = 'all') {
  const { user, getToken } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id, filter],
    queryFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('notifications', {
        body: { action: 'list', filter },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data.notifications || []) as Notification[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
}

export function useNotificationsRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Request permission on mount
  useEffect(() => {
    if (user?.id) requestNotificationPermission();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user-notify-${user.id}`)
      .on('broadcast', { event: 'new_notification' }, (payload) => {
        const row = (payload?.payload ?? null) as BroadcastPayload | null;
        qc.invalidateQueries({ queryKey: ['notifications'] });
        qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });

        if (!row) return;

        const nType = row.type || '';
        const isUrgent =
          nType === 'task_urgent' ||
          nType === 'lead_expiry' && (row.title?.includes('1 day') || row.title?.includes('3 day')) ||
          (row.title && row.title.toLowerCase().includes('urgent'));

        // Read user's sound preferences
        const prefs = readSoundPreferences(user.id);

        // Choose sound based on notification type
        if (nType === 'new_message') {
          const activeConvId = getActiveConversationId();
          const isViewingConv = activeConvId && row.reference_id === activeConvId;
          if (!isViewingConv && prefs.messages) {
            playMessageSound();
          }
        } else if (
          nType === 'task_assigned' ||
          nType === 'task_status_changed' ||
          nType === 'task_completed' ||
          nType.startsWith('task_')
        ) {
          if (prefs.tasks) playTaskSound();
        } else if (nType === 'lead_expiry') {
          if (prefs.notifications) playNotificationSound(!!isUrgent);
        } else {
          if (prefs.notifications) playNotificationSound(!!isUrgent);
        }

        // Show in-app toast
        if (row.title) {
          toast.info(row.title, {
            description: row.body || undefined,
            duration: isUrgent ? 10000 : 5000,
          });
        }

        // Show browser push notification
        if (row.title) {
          showBrowserNotification(row.title, {
            body: row.body || undefined,
            tag: row.id || 'notification',
            urgent: isUrgent,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}

export function useUnreadCount() {
  const { user, getToken } = useAuth();

  // Subscribe to realtime notification broadcasts
  useNotificationsRealtime();

  return useQuery({
    queryKey: ['notifications-unread-count', user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('notifications', {
        body: { action: 'unread_count' },
        headers: { Authorization: `Bearer ${token}` },
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
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (notificationId?: string) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('notifications', {
        body: {
          action: 'mark_read',
          notification_id: notificationId,
        },
        headers: { Authorization: `Bearer ${token}` },
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

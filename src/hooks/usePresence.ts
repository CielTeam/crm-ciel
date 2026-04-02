import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceInfo {
  isOnline: boolean;
  lastSeen: string | null;
}

export function usePresence(userId: string | undefined) {
  const [presenceState, setPresenceState] = useState<
    Map<string, PresenceInfo>
  >(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('presence-global', {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    const syncPresence = () => {
      const state = channel.presenceState();
      const map = new Map<string, PresenceInfo>();

      for (const [key, presences] of Object.entries(state)) {
        const latest = (presences as any[])[0];
        if (latest) {
          map.set(key, {
            isOnline: true,
            lastSeen: latest.online_at ?? null,
          });
        }
      }

      setPresenceState(map);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        setPresenceState((prev) => {
          const next = new Map(prev);
          const lastLeft = (leftPresences as any[])?.[0];
          next.set(key, {
            isOnline: false,
            lastSeen: lastLeft?.online_at ?? new Date().toISOString(),
          });
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);

  return presenceState;
}

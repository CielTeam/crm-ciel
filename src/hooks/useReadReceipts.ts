import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message } from '@/hooks/useMessages';

export type ReadStatus = 'sent' | 'delivered' | 'seen';

export function useReadReceipts(
  conversationId: string | null,
  messages: Message[] | undefined,
  currentUserId: string | undefined
) {
  const [receipts, setReceipts] = useState<Map<string, ReadStatus>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Initialize receipts for own messages as "delivered"
  useEffect(() => {
    if (!messages || !currentUserId) return;

    setReceipts((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const msg of messages) {
        if (msg.sender_id === currentUserId && !next.has(msg.id)) {
          next.set(msg.id, 'delivered');
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [messages, currentUserId]);

  // Subscribe to read broadcasts
  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    const channel = supabase.channel(`chat-read-${conversationId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        const readBy = payload?.user_id as string;
        const msgIds = payload?.message_ids as string[];
        if (!readBy || readBy === currentUserId || !msgIds?.length) return;

        setReceipts((prev) => {
          const next = new Map(prev);
          let changed = false;
          for (const id of msgIds) {
            if (next.has(id) && next.get(id) !== 'seen') {
              next.set(id, 'seen');
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, currentUserId]);

  // Broadcast read event for messages from others
  const broadcastRead = useCallback(() => {
    if (!messages || !currentUserId || !channelRef.current) return;

    const unreadIds = messages
      .filter((m) => m.sender_id !== currentUserId)
      .map((m) => m.id);

    if (unreadIds.length === 0) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'read',
      payload: { user_id: currentUserId, message_ids: unreadIds },
    });
  }, [messages, currentUserId]);

  // Auto-broadcast read when messages change (user is viewing)
  useEffect(() => {
    broadcastRead();
  }, [broadcastRead]);

  return receipts;
}

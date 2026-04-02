import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

const TYPING_EXPIRE_MS = 2000;
const DEBOUNCE_MS = 400;

export function useTypingIndicator(
  conversationId: string | null,
  currentUserId: string | undefined
) {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastBroadcastRef = useRef<number>(0);

  useEffect(() => {
    if (!conversationId || !currentUserId) {
      setTypingUserIds([]);
      return;
    }

    const channel = supabase.channel(`chat-${conversationId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const uid = payload?.user_id as string;
        if (!uid || uid === currentUserId) return;

        setTypingUserIds((prev) =>
          prev.includes(uid) ? prev : [...prev, uid]
        );

        // Clear existing timer for this user
        const existing = timersRef.current.get(uid);
        if (existing) clearTimeout(existing);

        // Auto-expire
        timersRef.current.set(
          uid,
          setTimeout(() => {
            setTypingUserIds((prev) => prev.filter((id) => id !== uid));
            timersRef.current.delete(uid);
          }, TYPING_EXPIRE_MS)
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      setTypingUserIds([]);
    };
  }, [conversationId, currentUserId]);

  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastBroadcastRef.current < DEBOUNCE_MS) return;
    lastBroadcastRef.current = now;

    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: currentUserId },
    });
  }, [currentUserId]);

  return { typingUserIds, sendTyping };
}

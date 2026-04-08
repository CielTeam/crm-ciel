import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message } from '@/hooks/useMessages';

export type ReadStatus = 'sent' | 'delivered' | 'seen';

const TYPING_EXPIRE_MS = 5000;
const DEBOUNCE_MS = 200;

interface ChatChannelResult {
  typingUserIds: string[];
  sendTyping: () => void;
  sendStopTyping: () => void;
  readReceipts: Map<string, ReadStatus>;
  broadcastRead: (messageIds: string[]) => void;
  broadcastNewMessage: (message: Message) => void;
}

export function useChatChannel(
  conversationId: string | null,
  messages: Message[] | undefined,
  currentUserId: string | undefined
): ChatChannelResult {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<Map<string, ReadStatus>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastBroadcastRef = useRef<number>(0);
  const qc = useQueryClient();

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

  // Single channel for typing + read + new_message broadcasts
  useEffect(() => {
    if (!conversationId || !currentUserId) {
      setTypingUserIds([]);
      return;
    }

    const channel = supabase.channel(`chat-${conversationId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const uid = payload?.user_id as string | undefined;
        if (!uid || uid === currentUserId) return;

        setTypingUserIds((prev) =>
          prev.includes(uid) ? prev : [...prev, uid]
        );

        const existing = timersRef.current.get(uid);
        if (existing) clearTimeout(existing);

        timersRef.current.set(
          uid,
          setTimeout(() => {
            setTypingUserIds((prev) => prev.filter((id) => id !== uid));
            timersRef.current.delete(uid);
          }, TYPING_EXPIRE_MS)
        );
      })
      .on('broadcast', { event: 'stop_typing' }, ({ payload }) => {
        const uid = payload?.user_id as string | undefined;
        if (!uid || uid === currentUserId) return;

        setTypingUserIds((prev) => prev.filter((id) => id !== uid));
        const existing = timersRef.current.get(uid);
        if (existing) {
          clearTimeout(existing);
          timersRef.current.delete(uid);
        }
      })
      .on('broadcast', { event: 'read' }, ({ payload }) => {
        const readBy = payload?.user_id as string | undefined;
        const msgIds = payload?.message_ids as string[] | undefined;
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
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        const msg = payload?.message as Message | undefined;
        if (!msg || msg.sender_id === currentUserId) return;

        // Append to messages cache
        qc.setQueryData<Message[]>(
          ['messages', currentUserId, conversationId],
          (old = []) => {
            if (old.some((m) => m.id === msg.id)) return old;
            return [...old, msg];
          }
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
  }, [conversationId, currentUserId, qc]);

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

  const sendStopTyping = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'stop_typing',
      payload: { user_id: currentUserId },
    });
  }, [currentUserId]);

  const broadcastRead = useCallback((messageIds: string[]) => {
    if (!messageIds.length || !channelRef.current) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'read',
      payload: { user_id: currentUserId, message_ids: messageIds },
    });
  }, [currentUserId]);

  const broadcastNewMessage = useCallback((message: Message) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'new_message',
      payload: { message },
    });
  }, []);

  return { typingUserIds, sendTyping, sendStopTyping, readReceipts: receipts, broadcastRead, broadcastNewMessage };
}

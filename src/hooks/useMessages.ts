import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Conversation {
  id: string;
  type: string;
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  lastMessage: Message | null;
  unreadCount: number;
  memberIds: string[];
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface MessagesFunctionResponse {
  conversations?: Conversation[];
  messages?: Message[];
  message?: Message;
  conversation?: Conversation;
  success?: boolean;
  error?: string;
}

function getUserId(userId?: string): string {
  if (!userId) {
    throw new Error('User is not authenticated');
  }
  return userId;
}

async function invokeMessages(
  body: Record<string, unknown>
): Promise<MessagesFunctionResponse> {
  const { data, error } = await supabase.functions.invoke<MessagesFunctionResponse>(
    'messages',
    { body }
  );

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data ?? {};
}

// ─── Helper: update conversations cache with a new message ───

function updateConversationsCache(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  message: Message,
  incrementUnread: boolean
) {
  qc.setQueryData<Conversation[]>(
    ['conversations', userId],
    (old) => {
      if (!old) return old;
      return old
        .map((conv) => {
          if (conv.id !== message.conversation_id) return conv;
          return {
            ...conv,
            lastMessage: message,
            updated_at: message.created_at,
            unreadCount: incrementUnread ? conv.unreadCount + 1 : conv.unreadCount,
          };
        })
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
  );
}

// ─── Real-time hook ───

export function useMessagesRealtime(conversationId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id || !conversationId) return;

    const userId = user.id;

    const channel = supabase
      .channel(`messages-rt-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;

          // Skip messages sent by current user (already in cache via mutation)
          if (newMsg.sender_id === userId) return;

          // Append to messages cache with duplicate check
          qc.setQueryData<Message[]>(
            ['messages', userId, conversationId],
            (old = []) => {
              if (old.some((m) => m.id === newMsg.id)) return old;
              return [...old, newMsg];
            }
          );

          // Update conversation list
          updateConversationsCache(qc, userId, newMsg, true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, conversationId, qc]);
}

// ─── Query hooks ───

export function useConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      const actorId = getUserId(user?.id);

      const data = await invokeMessages({
        action: 'list_conversations',
        actor_id: actorId,
      });

      return data.conversations ?? [];
    },
    enabled: !!user?.id,
  });
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();

  // Subscribe to realtime for current conversation
  useMessagesRealtime(conversationId);

  return useQuery({
    queryKey: ['messages', user?.id, conversationId],
    queryFn: async () => {
      const actorId = getUserId(user?.id);

      if (!conversationId) {
        throw new Error('Missing conversation ID');
      }

      const data = await invokeMessages({
        action: 'get_messages',
        actor_id: actorId,
        conversation_id: conversationId,
      });

      return data.messages ?? [];
    },
    enabled: !!user?.id && !!conversationId,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: { conversation_id: string; content: string }) => {
      const actorId = getUserId(user?.id);

      const data = await invokeMessages({
        action: 'send_message',
        actor_id: actorId,
        ...payload,
      });

      if (!data.message) {
        throw new Error('Message was not returned by the server');
      }

      return data.message;
    },
    onSuccess: (message) => {
      const userId = user?.id;
      if (!userId) return;

      // Direct cache update — append message
      qc.setQueryData<Message[]>(
        ['messages', userId, message.conversation_id],
        (old = []) => {
          if (old.some((m) => m.id === message.id)) return old;
          return [...old, message];
        }
      );

      // Update conversation preview
      updateConversationsCache(qc, userId, message, false);
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      type?: string;
      name?: string;
      member_ids: string[];
    }) => {
      const actorId = getUserId(user?.id);

      const data = await invokeMessages({
        action: 'create_conversation',
        actor_id: actorId,
        ...payload,
      });

      if (!data.conversation) {
        throw new Error('Conversation was not returned by the server');
      }

      return data.conversation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations', user?.id] });
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const actorId = getUserId(user?.id);

      await invokeMessages({
        action: 'mark_read',
        actor_id: actorId,
        conversation_id: conversationId,
      });

      return conversationId;
    },
    onSuccess: (conversationId) => {
      const userId = user?.id;
      if (!userId) return;

      // Direct cache update — set unread to 0
      qc.setQueryData<Conversation[]>(
        ['conversations', userId],
        (old) => {
          if (!old) return old;
          return old.map((conv) =>
            conv.id === conversationId
              ? { ...conv, unreadCount: 0 }
              : conv
          );
        }
      );
    },
  });
}

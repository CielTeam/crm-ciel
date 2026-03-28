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
    refetchInterval: 15000,
  });
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();

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
    refetchInterval: 5000,
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
      qc.invalidateQueries({ queryKey: ['messages', user?.id, message.conversation_id] });
      qc.invalidateQueries({ queryKey: ['conversations', user?.id] });
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
      qc.invalidateQueries({ queryKey: ['conversations', user?.id] });
      qc.invalidateQueries({ queryKey: ['messages', user?.id, conversationId] });
    },
  });
}
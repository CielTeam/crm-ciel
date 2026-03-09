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

export function useConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('messages', {
        body: { action: 'list_conversations', actor_id: user!.id },
      });
      if (error) throw error;
      return (data.conversations || []) as Conversation[];
    },
    enabled: !!user?.id,
    refetchInterval: 15000,
  });
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('messages', {
        body: { action: 'get_messages', actor_id: user!.id, conversation_id: conversationId },
      });
      if (error) throw error;
      return (data.messages || []) as Message[];
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
      const { data, error } = await supabase.functions.invoke('messages', {
        body: { action: 'send_message', actor_id: user!.id, ...payload },
      });
      if (error) throw error;
      return data.message as Message;
    },
    onSuccess: (msg) => {
      qc.invalidateQueries({ queryKey: ['messages', msg.conversation_id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: { type?: string; name?: string; member_ids: string[] }) => {
      const { data, error } = await supabase.functions.invoke('messages', {
        body: { action: 'create_conversation', actor_id: user!.id, ...payload },
      });
      if (error) throw error;
      return data.conversation as Conversation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('messages', {
        body: { action: 'mark_read', actor_id: user!.id, conversation_id: conversationId },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

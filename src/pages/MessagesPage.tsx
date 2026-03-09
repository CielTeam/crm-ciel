import { useState, useMemo, useEffect } from 'react';
import { useConversations, useMessages, useSendMessage, useMarkRead } from '@/hooks/useMessages';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';
import { ConversationList } from '@/components/messages/ConversationList';
import { MessageThread } from '@/components/messages/MessageThread';
import { MessageInput } from '@/components/messages/MessageInput';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { PageError } from '@/components/PageError';
import { Card } from '@/components/ui/card';
import { MessageSquare, Loader2 } from 'lucide-react';

export default function MessagesPage() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: conversations, isLoading: convLoading, error: convErr } = useConversations();
  const { data: messages, isLoading: msgLoading } = useMessages(selectedId);
  const { data: directoryUsers } = useDirectoryData();
  const sendMessage = useSendMessage();
  const markRead = useMarkRead();

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    directoryUsers?.forEach(u => m.set(u.userId, u.displayName));
    return m;
  }, [directoryUsers]);

  useEffect(() => {
    if (selectedId) {
      markRead.mutate(selectedId);
    }
  }, [selectedId]);

  const handleSend = (content: string) => {
    if (!selectedId) return;
    sendMessage.mutate({ conversation_id: selectedId, content });
  };

  if (convErr) return <PageError message="Failed to load conversations" />;

  const selectedConv = conversations?.find(c => c.id === selectedId);
  const otherName = selectedConv
    ? selectedConv.name || userMap.get(selectedConv.memberIds.find(id => id !== user?.id) || '') || 'Chat'
    : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <NewConversationDialog onCreated={setSelectedId} />
      </div>

      <div className="flex gap-4 h-[calc(100vh-12rem)]">
        {/* Conversation list */}
        <Card className="w-80 shrink-0 border flex flex-col overflow-hidden">
          {convLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !conversations?.length ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
              <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
              <p>No conversations yet</p>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              userMap={userMap}
              currentUserId={user?.id || ''}
            />
          )}
        </Card>

        {/* Message thread */}
        <Card className="flex-1 border flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Select a conversation to start messaging</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-background">
                <p className="text-sm font-semibold text-foreground">{otherName}</p>
              </div>
              {msgLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <MessageThread
                  messages={messages || []}
                  currentUserId={user?.id || ''}
                  userMap={userMap}
                />
              )}
              <MessageInput onSend={handleSend} disabled={sendMessage.isPending} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

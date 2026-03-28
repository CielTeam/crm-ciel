import { useState, useMemo, useEffect } from 'react';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkRead
} from '@/hooks/useMessages';

import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';

import {
  useUploadAttachment
} from '@/hooks/useAttachments';

import { ConversationList } from '@/components/messages/ConversationList';
import { MessageThread } from '@/components/messages/MessageThread';
import { MessageInput } from '@/components/messages/MessageInput';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { PageError } from '@/components/PageError';
import { Card } from '@/components/ui/card';
import { MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function MessagesPage() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: conversations, isLoading: convLoading, error: convErr } = useConversations();
  const { data: messages, isLoading: msgLoading } = useMessages(selectedId);

  const { data: directoryUsers } = useDirectoryData();

  const sendMessage = useSendMessage();
  const markRead = useMarkRead();
  const uploadAttachment = useUploadAttachment();

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    directoryUsers?.forEach(u => map.set(u.userId, u.displayName));
    return map;
  }, [directoryUsers]);

  useEffect(() => {
    if (selectedId) {
      markRead.mutate(selectedId);
    }
  }, [selectedId, markRead]);

  const handleSend = (content: string) => {
    if (!selectedId) return;
    if (!content.trim()) return;

    sendMessage.mutate({
      conversation_id: selectedId,
      content: content.trim(),
    });
  };

  const handleFileUpload = (file: File) => {
    if (!selectedId) return;

    sendMessage.mutate(
      {
        conversation_id: selectedId,
        content: `📎 ${file.name}`,
      },
      {
        onSuccess: (msg) => {
          if (!msg?.id) {
            toast.error('Failed to attach file');
            return;
          }

          uploadAttachment.mutate(
            {
              file,
              entity_type: 'message',
              entity_id: msg.id,
            },
            {
              onSuccess: () => toast.success('File attached'),
              onError: () => toast.error('Upload failed'),
            }
          );
        },
        onError: () => toast.error('Message send failed'),
      }
    );
  };

  if (convErr) return <PageError message="Failed to load conversations" />;

  const selectedConv = conversations?.find(c => c.id === selectedId);

  const otherName =
    selectedConv?.name ||
    userMap.get(
      selectedConv?.memberIds?.find(id => id !== user?.id) || ''
    ) ||
    'Chat';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <NewConversationDialog onCreated={setSelectedId} />
      </div>

      <div className="flex gap-4 h-[calc(100vh-12rem)]">

        {/* Conversations */}
        <Card className="w-80 flex flex-col overflow-hidden">
          {convLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : !conversations?.length ? (
            <div className="flex-1 flex flex-col items-center justify-center text-sm">
              <MessageSquare className="mb-2 opacity-30" />
              No conversations
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

        {/* Messages */}
        <Card className="flex-1 flex flex-col overflow-hidden">

          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="p-3 border-b font-semibold">
                {otherName}
              </div>

              {msgLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <MessageThread
                  messages={messages || []}
                  currentUserId={user?.id || ''}
                  userMap={userMap}
                />
              )}

              <MessageInput
                onSend={handleSend}
                onFileUpload={handleFileUpload}
                disabled={sendMessage.isPending}
                isUploading={uploadAttachment.isPending}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
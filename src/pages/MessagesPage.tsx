import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkRead
} from '@/hooks/useMessages';

import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAuth } from '@/contexts/AuthContext';
import { usePresence } from '@/hooks/usePresence';
import { useChatChannel } from '@/hooks/useChatChannel';

import {
  useUploadAttachment
} from '@/hooks/useAttachments';

import { ConversationList } from '@/components/messages/ConversationList';
import { MessageThread } from '@/components/messages/MessageThread';
import { MessageInput } from '@/components/messages/MessageInput';
import { ChatHeader } from '@/components/messages/ChatHeader';
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
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const uploadAttachment = useUploadAttachment();

  const presenceMap = usePresence(user?.id);
  const { typingUserIds, sendTyping, sendStopTyping, readReceipts, broadcastRead, broadcastNewMessage } = useChatChannel(
    selectedId, messages, user?.id
  );

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    directoryUsers?.forEach(u => map.set(u.userId, u.displayName));
    return map;
  }, [directoryUsers]);

  // Mark conversation as read when selected and broadcast read events
  useEffect(() => {
    if (!selectedId || !messages || !user?.id) return;

    markReadRef.current.mutate(selectedId);

    // Broadcast read for messages from others
    const otherMsgIds = messages
      .filter(m => m.sender_id !== user.id)
      .map(m => m.id);
    if (otherMsgIds.length > 0) {
      broadcastRead(otherMsgIds);
    }
  }, [selectedId, messages, user?.id, broadcastRead]);

  const handleSend = useCallback((content: string) => {
    if (!selectedId) return;
    if (!content.trim()) return;

    sendMessage.mutate({
      conversation_id: selectedId,
      content: content.trim(),
    });
  }, [selectedId, sendMessage]);

  const handleFileUpload = useCallback((file: File) => {
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
  }, [selectedId, sendMessage, uploadAttachment]);

  if (convErr) return <PageError message="Failed to load conversations" />;

  const selectedConv = conversations?.find(c => c.id === selectedId);

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
              presenceMap={presenceMap}
            />
          )}
        </Card>

        {/* Messages */}
        <Card className="flex-1 flex flex-col overflow-hidden">

          {!selectedId || !selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              <ChatHeader
                conversation={selectedConv}
                userMap={userMap}
                currentUserId={user?.id || ''}
                presenceMap={presenceMap}
              />

              {msgLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <MessageThread
                  messages={messages || []}
                  currentUserId={user?.id || ''}
                  userMap={userMap}
                  typingUserIds={typingUserIds}
                  readReceipts={readReceipts}
                  isGroup={selectedConv.type === 'group'}
                />
              )}

              <MessageInput
                onSend={handleSend}
                onFileUpload={handleFileUpload}
                onTyping={sendTyping}
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

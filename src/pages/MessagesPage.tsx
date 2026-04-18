import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  useUploadAttachment,
  useDeleteAttachment,
  useAttachmentsByEntityIds,
} from '@/hooks/useAttachments';

import { ConversationList } from '@/components/messages/ConversationList';
import { MessageThread } from '@/components/messages/MessageThread';
import { MessageInput } from '@/components/messages/MessageInput';
import { ChatHeader } from '@/components/messages/ChatHeader';
import { NewConversationDialog } from '@/components/messages/NewConversationDialog';
import { PageError } from '@/components/PageError';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MessageSquare, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const UNREAD_FILTER_KEY = 'messages.unreadOnly';

export default function MessagesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get('conversation')
  );

  const [unreadOnly, setUnreadOnly] = useState<boolean>(() => {
    try { return localStorage.getItem(UNREAD_FILTER_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(UNREAD_FILTER_KEY, unreadOnly ? '1' : '0'); } catch { /* ignore */ }
  }, [unreadOnly]);

  useEffect(() => {
    if (selectedId) {
      setSearchParams({ conversation: selectedId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  }, [selectedId, setSearchParams]);

  const { data: conversations, isLoading: convLoading, error: convErr } = useConversations();
  const { data: messages, isLoading: msgLoading } = useMessages(selectedId);

  const { data: directoryUsers } = useDirectoryData();

  const sendMessage = useSendMessage();
  const markRead = useMarkRead();
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  const uploadAttachment = useUploadAttachment();
  const deleteAttachment = useDeleteAttachment();

  // Fetch attachments for all messages in the active conversation
  const messageIds = useMemo(() => messages?.map(m => m.id) ?? [], [messages]);
  const { data: messageAttachments } = useAttachmentsByEntityIds(
    selectedId ? 'message' : null,
    messageIds
  );

  const presenceMap = usePresence(user?.id);
  const { typingUserIds, sendTyping, sendStopTyping, readReceipts, broadcastRead, broadcastNewMessage } = useChatChannel(
    selectedId, messages, user?.id
  );

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    directoryUsers?.forEach(u => map.set(u.userId, u.displayName));
    return map;
  }, [directoryUsers]);

  useEffect(() => {
    if (!selectedId || !messages || !user?.id) return;
    markReadRef.current.mutate(selectedId);
    const otherMsgIds = messages.filter(m => m.sender_id !== user.id).map(m => m.id);
    if (otherMsgIds.length > 0) broadcastRead(otherMsgIds);
  }, [selectedId, messages, user?.id, broadcastRead]);

  const handleSend = useCallback((content: string) => {
    if (!selectedId || !content.trim()) return;
    sendMessage.mutate({ conversation_id: selectedId, content: content.trim() }, {
      onSuccess: (message) => broadcastNewMessage(message),
    });
  }, [selectedId, sendMessage, broadcastNewMessage]);

  const handleFileUpload = useCallback((file: File) => {
    if (!selectedId) return;
    sendMessage.mutate({ conversation_id: selectedId, content: `📎 ${file.name}` }, {
      onSuccess: (msg) => {
        if (!msg?.id) { toast.error('Failed to attach file'); return; }
        uploadAttachment.mutate({ file, entity_type: 'message', entity_id: msg.id }, {
          onSuccess: () => toast.success('File attached'),
          onError: () => toast.error('Upload failed'),
        });
      },
      onError: () => toast.error('Message send failed'),
    });
  }, [selectedId, sendMessage, uploadAttachment]);

  const handleDeleteAttachment = useCallback((att: { id: string; entity_id: string }) => {
    deleteAttachment.mutate({ attachment_id: att.id, entity_type: 'message', entity_id: att.entity_id });
  }, [deleteAttachment]);

  if (convErr) return <PageError message="Failed to load conversations" />;

  const selectedConv = conversations?.find(c => c.id === selectedId);
  const visibleConversations = unreadOnly
    ? (conversations || []).filter(c => c.unreadCount > 0)
    : (conversations || []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <NewConversationDialog onCreated={setSelectedId} />
      </div>

      <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-12rem)]">
        <Card className="w-full md:w-80 flex flex-col overflow-hidden shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <Label htmlFor="unread-only" className="text-xs text-muted-foreground cursor-pointer">
              Unread only
            </Label>
            <Switch id="unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
          </div>
          {convLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
          ) : !visibleConversations.length ? (
            <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted-foreground p-4 text-center">
              <MessageSquare className="mb-2 opacity-30" />
              {unreadOnly ? 'No unread conversations' : 'No conversations'}
            </div>
          ) : (
            <ConversationList conversations={visibleConversations} selectedId={selectedId} onSelect={setSelectedId} userMap={userMap} currentUserId={user?.id || ''} presenceMap={presenceMap} />
          )}
        </Card>

        <Card className="flex-1 flex flex-col overflow-hidden">
          {!selectedId || !selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-sm">Select a conversation</div>
          ) : (
            <>
              <ChatHeader conversation={selectedConv} userMap={userMap} currentUserId={user?.id || ''} presenceMap={presenceMap} />
              {msgLoading ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
              ) : (
                <MessageThread
                  messages={messages || []}
                  currentUserId={user?.id || ''}
                  userMap={userMap}
                  typingUserIds={typingUserIds}
                  readReceipts={readReceipts}
                  isGroup={selectedConv.type === 'group'}
                  messageAttachments={messageAttachments}
                  onDeleteAttachment={handleDeleteAttachment}
                  isDeletingAttachment={deleteAttachment.isPending}
                />
              )}
              <MessageInput onSend={handleSend} onFileUpload={handleFileUpload} onTyping={sendTyping} onStopTyping={sendStopTyping} disabled={sendMessage.isPending} isUploading={uploadAttachment.isPending} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Message } from '@/hooks/useMessages';
import type { ReadStatus } from '@/hooks/useChatChannel';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { FileAttachmentList } from '@/components/shared/FileAttachmentList';
import type { Attachment } from '@/hooks/useAttachments';
import { Check, CheckCheck } from 'lucide-react';

interface Props {
  messages: Message[];
  currentUserId: string;
  userMap: Map<string, string>;
  messageAttachments?: Map<string, Attachment[]>;
  onDeleteAttachment?: (attachment: Attachment) => void;
  isDeletingAttachment?: boolean;
  typingUserIds?: string[];
  readReceipts?: Map<string, ReadStatus>;
  isGroup?: boolean;
}

export function MessageThread({
  messages,
  currentUserId,
  userMap,
  messageAttachments,
  onDeleteAttachment,
  isDeletingAttachment,
  typingUserIds = [],
  readReceipts,
  isGroup = false,
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm bg-[hsl(var(--chat-surface))]">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4 bg-[hsl(var(--chat-surface))]">
      <div className="space-y-3 py-4">
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          const senderName = userMap.get(msg.sender_id) ?? 'Unknown';
          const attachments = messageAttachments?.get(msg.id) ?? [];

          return (
            <div
              key={msg.id}
              className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm',
                  isMine
                    ? 'bg-[hsl(var(--chat-bubble-mine))] text-[hsl(var(--chat-bubble-mine-fg))]'
                    : 'bg-[hsl(var(--chat-bubble-other))] text-[hsl(var(--chat-bubble-other-fg))]'
                )}
              >
                {!isMine && isGroup && (
                  <p className="text-[11px] font-semibold opacity-80 mb-0.5">
                    {senderName}
                  </p>
                )}

                <p className="text-sm whitespace-pre-wrap break-words">
                  {msg.content}
                </p>

                {attachments.length > 0 && (
                  <div className="mt-2">
                    <FileAttachmentList
                      attachments={attachments}
                      currentUserId={currentUserId}
                      onDelete={onDeleteAttachment}
                      isDeleting={isDeletingAttachment}
                      compact
                    />
                  </div>
                )}

                <div className={cn(
                  'flex items-center gap-1 mt-1',
                  isMine ? 'justify-end' : ''
                )}>
                  <p
                    className={cn(
                      'text-[10px]',
                      isMine ? 'text-[hsl(var(--chat-bubble-mine-fg))]/70' : 'text-[hsl(var(--chat-meta))]'
                    )}
                  >
                    {format(new Date(msg.created_at), 'HH:mm')}
                  </p>
                  {isMine && readReceipts && (() => {
                    const status = readReceipts.get(msg.id) ?? 'sent';
                    if (status === 'seen') {
                      return <CheckCheck className="h-3.5 w-3.5 text-[hsl(var(--chat-read))]" />;
                    }
                    if (status === 'delivered') {
                      return <CheckCheck className="h-3 w-3 text-[hsl(var(--chat-bubble-mine-fg))]/60" />;
                    }
                    return <Check className="h-3 w-3 text-[hsl(var(--chat-bubble-mine-fg))]/60" />;
                  })()}
                </div>
              </div>
            </div>
          );
        })}

        {typingUserIds.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-[hsl(var(--chat-bubble-other))] text-[hsl(var(--chat-bubble-other-fg))] rounded-2xl px-3 py-2">
              <p className="text-xs">
                {typingUserIds.length <= 2
                  ? typingUserIds
                      .map((id) => userMap.get(id) ?? 'Someone')
                      .join(', ')
                  : `${typingUserIds.length} people`}{' '}
                {typingUserIds.length === 1 ? 'is' : 'are'} typing
                <span className="inline-flex ml-0.5">
                  <span className="animate-bounce [animation-delay:0ms]">.</span>
                  <span className="animate-bounce [animation-delay:150ms]">.</span>
                  <span className="animate-bounce [animation-delay:300ms]">.</span>
                </span>
              </p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

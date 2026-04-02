import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Message } from '@/hooks/useMessages';
import type { ReadStatus } from '@/hooks/useReadReceipts';
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
}: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No messages yet. Start the conversation!
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4">
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
                  'max-w-[75%] rounded-xl px-3 py-2',
                  isMine
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                )}
              >
                {!isMine && (
                  <p className="text-[10px] font-medium opacity-70 mb-0.5">
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

                <p
                  className={cn(
                    'text-[10px] mt-1',
                    isMine
                      ? 'text-primary-foreground/60'
                      : 'text-muted-foreground/60'
                  )}
                >
                  {format(new Date(msg.created_at), 'HH:mm')}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '@/hooks/useMessages';
import type { PresenceInfo } from '@/hooks/usePresence';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  userMap: Map<string, string>;
  currentUserId: string;
  presenceMap?: Map<string, PresenceInfo>;
}

export function ConversationList({ conversations, selectedId, onSelect, userMap, currentUserId, presenceMap }: Props) {
  const getDisplayName = (conv: Conversation) => {
    if (conv.name) return conv.name;
    const other = conv.memberIds.find(id => id !== currentUserId);
    return other ? userMap.get(other) || 'Unknown' : 'Unknown';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-2">
        {conversations.map(conv => {
          const name = getDisplayName(conv);
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                selectedId === conv.id ? 'bg-accent' : 'hover:bg-muted'
              )}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground truncate">{name}</p>
                  {conv.unreadCount > 0 && (
                    <Badge variant="default" className="ml-2 h-5 min-w-5 flex items-center justify-center text-xs">
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessage.content}
                  </p>
                )}
                {conv.lastMessage && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatDistanceToNow(new Date(conv.lastMessage.created_at), { addSuffix: true })}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

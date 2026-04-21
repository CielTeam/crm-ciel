import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Conversation } from '@/hooks/useMessages';
import type { PresenceInfo } from '@/hooks/usePresence';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Users } from 'lucide-react';

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
    if (conv.type === 'group') {
      if (conv.name) return conv.name;
      const others = conv.memberIds
        .filter(id => id !== currentUserId)
        .map(id => userMap.get(id) || 'Unknown');
      if (others.length <= 2) return others.join(', ');
      return `${others.slice(0, 2).join(', ')}, +${others.length - 2}`;
    }
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
          const isGroup = conv.type === 'group';
          const otherId = !isGroup ? conv.memberIds.find(id => id !== currentUserId) : undefined;
          const presence = otherId ? presenceMap?.get(otherId) : undefined;
          const isOnline = isGroup
            ? conv.memberIds.some(id => id !== currentUserId && presenceMap?.get(id)?.isOnline)
            : (presence?.isOnline ?? false);

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
                selectedId === conv.id
                  ? 'bg-[hsl(var(--chat-bubble-mine))]/15 border-l-2 border-[hsl(var(--chat-bubble-mine))]'
                  : 'hover:bg-muted border-l-2 border-transparent'
              )}
            >
              <div className="relative shrink-0">
                {isGroup ? (
                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-[hsl(var(--chat-bubble-mine))]/15">
                    <Users className="h-4 w-4 text-[hsl(var(--chat-bubble-mine))]" />
                  </div>
                ) : (
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs bg-[hsl(var(--chat-bubble-mine))]/15 text-[hsl(var(--chat-bubble-mine))] font-semibold">
                      {getInitials(name)}
                    </AvatarFallback>
                  </Avatar>
                )}
                {isOnline && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                  {conv.unreadCount > 0 && (
                    <Badge className="ml-2 h-5 min-w-5 flex items-center justify-center text-xs bg-[hsl(var(--chat-bubble-mine))] text-white hover:bg-[hsl(var(--chat-bubble-mine))]">
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessage.content}
                  </p>
                )}
                {!isGroup && presence && !isOnline && presence.lastSeen ? (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    last seen {formatDistanceToNow(new Date(presence.lastSeen), { addSuffix: true })}
                  </p>
                ) : conv.lastMessage ? (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {formatDistanceToNow(new Date(conv.lastMessage.created_at), { addSuffix: true })}
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

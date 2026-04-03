import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Conversation } from '@/hooks/useMessages';
import type { PresenceInfo } from '@/hooks/usePresence';
import { formatDistanceToNow } from 'date-fns';
import { Users } from 'lucide-react';

interface Props {
  conversation: Conversation;
  userMap: Map<string, string>;
  currentUserId: string;
  presenceMap: Map<string, PresenceInfo>;
}

export function ChatHeader({ conversation, userMap, currentUserId, presenceMap }: Props) {
  const isGroup = conversation.type === 'group';

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (isGroup) {
    const onlineCount = conversation.memberIds.filter(
      id => id !== currentUserId && presenceMap.get(id)?.isOnline
    ).length;

    const displayName = conversation.name || getGroupFallbackName(conversation.memberIds, currentUserId, userMap);

    return (
      <div className="p-3 border-b flex items-center gap-3">
        <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10">
          <Users className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{displayName}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.memberIds.length} members
            {onlineCount > 0 && `, ${onlineCount} online`}
          </p>
        </div>
      </div>
    );
  }

  // Direct chat
  const otherId = conversation.memberIds.find(id => id !== currentUserId);
  const otherName = otherId ? userMap.get(otherId) || 'Unknown' : 'Unknown';
  const presence = otherId ? presenceMap.get(otherId) : undefined;
  const isOnline = presence?.isOnline ?? false;

  return (
    <div className="p-3 border-b flex items-center gap-3">
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {getInitials(otherName)}
          </AvatarFallback>
        </Avatar>
        {isOnline && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate">{otherName}</p>
        {isOnline ? (
          <p className="text-xs text-green-600">Online</p>
        ) : presence?.lastSeen ? (
          <p className="text-xs text-muted-foreground">
            Last seen {formatDistanceToNow(new Date(presence.lastSeen), { addSuffix: true })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function getGroupFallbackName(
  memberIds: string[],
  currentUserId: string,
  userMap: Map<string, string>
): string {
  const others = memberIds
    .filter(id => id !== currentUserId)
    .map(id => userMap.get(id) || 'Unknown');

  if (others.length <= 3) return others.join(', ');
  return `${others.slice(0, 2).join(', ')}, +${others.length - 2}`;
}

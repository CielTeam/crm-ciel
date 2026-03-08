import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone } from 'lucide-react';
import type { DirectoryUser } from '@/hooks/useDirectoryData';

interface DirectoryCardProps {
  user: DirectoryUser;
  onClick: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function DirectoryCard({ user, onClick }: DirectoryCardProps) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 border"
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 border-2 border-border">
            <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
              {getInitials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{user.displayName}</h3>
            <Badge variant="secondary" className="mt-1 text-xs">
              {user.roleLabel}
            </Badge>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
              {user.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{user.phone}</span>
                </div>
              )}
            </div>
          </div>
          <div className="h-2.5 w-2.5 rounded-full bg-success shrink-0 mt-1" title="Active" />
        </div>
      </CardContent>
    </Card>
  );
}

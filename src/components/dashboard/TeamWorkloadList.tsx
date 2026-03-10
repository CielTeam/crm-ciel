import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

interface TeamMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  openTasks: number;
}

export function TeamWorkloadList({ members }: { members: TeamMember[] }) {
  if (!members.length) {
    return (
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Team Workload</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No team members found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Team Workload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-8 w-8">
                <AvatarImage src={m.avatarUrl} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {m.displayName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground truncate">{m.displayName}</span>
            </div>
            <Badge variant="outline" className={`shrink-0 ${m.openTasks > 5 ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}`}>
              {m.openTasks} tasks
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

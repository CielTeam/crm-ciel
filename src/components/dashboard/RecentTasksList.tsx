import { isPast, isToday } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare, Star } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  pinned?: boolean;
  completed_at?: string | null;
}

const statusColors: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/15 text-primary',
  done: 'bg-emerald-500/15 text-emerald-600',
  pending_accept: 'bg-amber-500/15 text-amber-600',
  accepted: 'bg-blue-500/15 text-blue-600',
  submitted: 'bg-violet-500/15 text-violet-600',
  approved: 'bg-emerald-500/15 text-emerald-600',
  rejected: 'bg-destructive/15 text-destructive',
  declined: 'bg-destructive/15 text-destructive',
};

const priorityColors: Record<string, string> = {
  urgent: 'bg-destructive/15 text-destructive',
  high: 'bg-amber-500/15 text-amber-600',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

export function RecentTasksList({ tasks, onNavigate }: { tasks: Task[]; onNavigate?: () => void }) {
  if (!tasks.length) {
    return (
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Recent Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No tasks yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-foreground">Recent Tasks</CardTitle>
        {onNavigate && (
          <button onClick={onNavigate} className="text-xs text-primary hover:underline">
            View all
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((t) => {
          const overdue = t.due_date && !t.completed_at && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date));
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer ${overdue ? 'border border-destructive/30 bg-destructive/5' : ''}`}
              onClick={onNavigate}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {t.pinned && <Star className="h-3 w-3 inline mr-1 text-amber-500 fill-amber-500" />}
                  {t.title}
                </p>
                {t.due_date && (
                  <p className={`text-xs ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    Due {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {overdue && ' (overdue)'}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Badge variant="outline" className={`text-[10px] ${priorityColors[t.priority] || ''}`}>
                  {t.priority}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${statusColors[t.status] || ''}`}>
                  {t.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

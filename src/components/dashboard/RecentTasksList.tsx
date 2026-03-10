import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckSquare } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

const statusColors: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/15 text-primary',
  done: 'bg-success/15 text-success',
};

const priorityColors: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive',
  high: 'bg-warning/15 text-warning',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

export function RecentTasksList({ tasks }: { tasks: Task[] }) {
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
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground">Recent Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
              {t.due_date && (
                <p className="text-xs text-muted-foreground">
                  Due {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Badge variant="outline" className={`text-[10px] ${priorityColors[t.priority] || ''}`}>
                {t.priority}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${statusColors[t.status] || ''}`}>
                {t.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

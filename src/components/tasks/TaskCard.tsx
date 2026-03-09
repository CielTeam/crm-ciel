import { format, isPast, isToday } from 'date-fns';
import { Calendar, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Task } from '@/hooks/useTasks';

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', className: 'bg-primary/10 text-primary' },
  high: { label: 'High', className: 'bg-warning/15 text-warning-foreground border-warning/30' },
  urgent: { label: 'Urgent', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}

export function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  const priority = priorityConfig[task.priority] || priorityConfig.medium;
  const overdue = task.due_date && !task.completed_at && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));

  return (
    <Card className={`border transition-colors ${task.status === 'done' ? 'opacity-60' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={`font-medium text-foreground truncate ${task.status === 'done' ? 'line-through' : ''}`}>
              {task.title}
            </h3>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
            )}
          </div>
          <Badge variant="outline" className={priority.className}>
            {priority.label}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Select value={task.status} onValueChange={(v) => onStatusChange(task.id, v)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>

            {task.due_date && (
              <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                <Calendar className="h-3 w-3" />
                {format(new Date(task.due_date), 'MMM d')}
                {overdue && ' (overdue)'}
              </span>
            )}
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(task.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

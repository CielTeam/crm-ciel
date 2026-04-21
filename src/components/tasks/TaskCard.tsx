import { useState } from 'react';
import { format, isPast, isToday } from 'date-fns';
import { Calendar, Trash2, User, Clock, AlertTriangle, CheckCircle2, XCircle, Send, ThumbsUp, ThumbsDown, Star, RotateCcw, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AcceptDeclineDialog } from './AcceptDeclineDialog';
import { SubmitTaskDialog } from './SubmitTaskDialog';
import { ReviewTaskDialog } from './ReviewTaskDialog';
import { getTimeToStart, getTimeToComplete, getWaitingTime } from '@/lib/taskTimings';
import type { Task } from '@/hooks/useTasks';

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', className: 'bg-primary/10 text-primary' },
  high: { label: 'High', className: 'bg-warning/15 text-warning-foreground border-warning/30' },
  urgent: { label: 'Urgent', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  todo: { label: 'To Do', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-primary/10 text-primary' },
  done: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-600' },
  pending_accept: { label: 'Pending', className: 'bg-amber-500/10 text-amber-600' },
  accepted: { label: 'Accepted', className: 'bg-blue-500/10 text-blue-600' },
  declined: { label: 'Declined', className: 'bg-destructive/10 text-destructive' },
  submitted: { label: 'Submitted', className: 'bg-violet-500/10 text-violet-600' },
  approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600' },
  rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive' },
};

export interface TaskAssignee {
  displayName: string;
  avatarUrl: string | null;
}

interface TaskCardProps {
  task: Task;
  assignee?: TaskAssignee | null;
  creator?: TaskAssignee | null;
  currentUserId: string;
  onStatusChange: (id: string, status: string, extra?: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onCardClick?: () => void;
  onTogglePin: (id: string) => void;
  onMarkDone: (id: string) => void;
  onMarkUndone: (id: string) => void;
}

export function TaskCard({ task, assignee, creator, currentUserId, onStatusChange, onDelete, onCardClick, onTogglePin, onMarkDone, onMarkUndone }: TaskCardProps) {
  const [acceptDeclineMode, setAcceptDeclineMode] = useState<'accept' | 'decline' | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<'approve' | 'reject' | null>(null);

  const priority = priorityConfig[task.priority] || priorityConfig.medium;
  const status = statusConfig[task.status] || statusConfig.todo;
  const overdue = task.due_date && !task.completed_at && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));
  const isDone = task.status === 'done' || task.status === 'approved';

  const isCreator = task.created_by === currentUserId;
  const isAssignee = task.assigned_to === currentUserId;
  const isPersonal = task.task_type === 'personal';

  const person = isCreator ? assignee : creator;
  const initials = person?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '';

  // Timing metrics
  const timeToStart = getTimeToStart(task);
  const timeToComplete = getTimeToComplete(task);
  const waitingTime = getWaitingTime(task);

  // Can mark done: personal tasks in todo/in_progress, or assigned tasks if assignee in in_progress
  const canMarkDone = !isDone && (
    (isPersonal && isCreator && ['todo', 'in_progress'].includes(task.status)) ||
    (!isPersonal && isAssignee && task.status === 'in_progress')
  );
  const canMarkUndone = isDone && (isCreator || isAssignee);

  return (
    <>
      <Card
        className={`border transition-colors cursor-pointer hover:border-primary/40 ${isDone ? 'opacity-60' : ''} ${overdue ? 'border-destructive/50' : ''} ${task.pinned ? 'ring-1 ring-amber-400/30' : ''}`}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, [role="combobox"], [role="listbox"], [role="option"]')) return;
          onCardClick?.();
        }}
      >
        <CardContent className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
                {!isPersonal && (
                  <Badge variant="secondary" className="text-[10px]">Assigned</Badge>
                )}
                {task.lead_id && (
                  <Badge variant="outline" className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/30">
                    <Building2 className="h-2.5 w-2.5 mr-0.5" /> From Lead
                  </Badge>
                )}
                {overdue && (
                  <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                )}
              </div>
              <h3 className={`font-medium text-foreground truncate ${isDone ? 'line-through' : ''}`}>
                {task.pinned && <Star className="h-3.5 w-3.5 inline mr-1 text-amber-500 fill-amber-500" />}
                {task.title}
              </h3>
              {task.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={priority.className}>
                {priority.label}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 shrink-0 ${task.pinned ? 'text-amber-500' : 'text-muted-foreground'}`}
                onClick={(e) => { e.stopPropagation(); onTogglePin(task.id); }}
              >
                <Star className={`h-3.5 w-3.5 ${task.pinned ? 'fill-amber-500' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            {task.due_date && (
              <span className={`flex items-center gap-1 ${overdue ? 'text-destructive font-medium' : ''}`}>
                <Calendar className="h-3 w-3" />
                {format(new Date(task.due_date), 'MMM d, h:mm a')}
                {overdue && ' (overdue)'}
              </span>
            )}

            {task.estimated_duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Est: {task.estimated_duration}
              </span>
            )}

            {task.actual_duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Actual: {task.actual_duration}
              </span>
            )}

            {person && (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={person.avatarUrl || undefined} alt={person.displayName} />
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {initials || <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[100px]">
                  {isCreator ? person.displayName : `From: ${person.displayName}`}
                </span>
              </div>
            )}
          </div>

          {/* Timing metrics */}
          {(timeToStart || timeToComplete || waitingTime) && (
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground/70">
              {timeToStart && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeToStart}</span>}
              {timeToComplete && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{timeToComplete}</span>}
              {waitingTime && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{waitingTime}</span>}
            </div>
          )}

          {/* Challenges / Feedback / Decline reason */}
          {task.challenges && (
            <div className="text-xs bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
              <span className="font-medium text-amber-600 flex items-center gap-1 mb-0.5">
                <AlertTriangle className="h-3 w-3" /> Challenges
              </span>
              <p className="text-muted-foreground">{task.challenges}</p>
            </div>
          )}

          {task.feedback && (
            <div className="text-xs bg-primary/5 border border-primary/20 rounded-md p-2">
              <span className="font-medium text-primary">Lead Feedback:</span>
              <p className="text-muted-foreground">{task.feedback}</p>
            </div>
          )}

          {task.decline_reason && (
            <div className="text-xs bg-destructive/5 border border-destructive/20 rounded-md p-2">
              <span className="font-medium text-destructive">Decline Reason:</span>
              <p className="text-muted-foreground">{task.decline_reason}</p>
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Personal task status selector */}
              {isPersonal && isCreator && !isDone && (
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
              )}

              {/* Mark Done / Undone */}
              {canMarkDone && (
                <Button size="sm" variant="default" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={(e) => { e.stopPropagation(); onMarkDone(task.id); }}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Done
                </Button>
              )}
              {canMarkUndone && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); onMarkUndone(task.id); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Mark Undone
                </Button>
              )}

              {/* Assigned task: assignee actions */}
              {!isPersonal && isAssignee && task.status === 'pending_accept' && (
                <>
                  <Button size="sm" variant="default" className="h-8 text-xs" onClick={() => setAcceptDeclineMode('accept')}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                  </Button>
                  <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => setAcceptDeclineMode('decline')}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Decline
                  </Button>
                </>
              )}

              {!isPersonal && isAssignee && task.status === 'accepted' && (
                <Button size="sm" className="h-8 text-xs" onClick={() => onStatusChange(task.id, 'in_progress')}>
                  Start Working
                </Button>
              )}

              {!isPersonal && isAssignee && task.status === 'in_progress' && (
                <Button size="sm" className="h-8 text-xs" onClick={() => setSubmitOpen(true)}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Submit
                </Button>
              )}

              {!isPersonal && isAssignee && task.status === 'rejected' && (
                <Button size="sm" className="h-8 text-xs" onClick={() => onStatusChange(task.id, 'in_progress')}>
                  Resume Work
                </Button>
              )}

              {/* Assigned task: creator/lead actions */}
              {!isPersonal && isCreator && task.status === 'submitted' && (
                <>
                  <Button size="sm" className="h-8 text-xs" onClick={() => setReviewMode('approve')}>
                    <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => setReviewMode('reject')}>
                    <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </>
              )}
            </div>

            {(isCreator || (isAssignee && task.status === 'pending_accept')) && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {acceptDeclineMode && (
        <AcceptDeclineDialog
          open={!!acceptDeclineMode}
          onOpenChange={() => setAcceptDeclineMode(null)}
          mode={acceptDeclineMode}
          taskTitle={task.title}
          onConfirm={(reason) => {
            if (acceptDeclineMode === 'accept') {
              onStatusChange(task.id, 'accepted');
            } else {
              onStatusChange(task.id, 'declined', { decline_reason: reason });
            }
          }}
        />
      )}

      <SubmitTaskDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        taskTitle={task.title}
        onConfirm={(data) => {
          onStatusChange(task.id, 'submitted', data);
        }}
      />

      {reviewMode && (
        <ReviewTaskDialog
          open={!!reviewMode}
          onOpenChange={() => setReviewMode(null)}
          mode={reviewMode}
          taskTitle={task.title}
          onConfirm={(feedback) => {
            onStatusChange(task.id, reviewMode === 'approve' ? 'approved' : 'rejected', { feedback });
          }}
        />
      )}
    </>
  );
}

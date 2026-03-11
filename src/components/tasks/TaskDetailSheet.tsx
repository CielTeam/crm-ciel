import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Calendar, Clock, User, AlertTriangle, MessageSquare, CheckCircle2,
  XCircle, Send, ThumbsUp, ThumbsDown, ArrowRight, Circle, History, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { useTaskActivity, useTaskComments, useAddTaskComment, type Task, type TaskActivityLog } from '@/hooks/useTasks';
import type { TaskAssignee } from './TaskCard';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; className: string; icon: typeof Circle }> = {
  todo: { label: 'To Do', className: 'bg-muted text-muted-foreground', icon: Circle },
  in_progress: { label: 'In Progress', className: 'bg-primary/10 text-primary', icon: Clock },
  done: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
  pending_accept: { label: 'Pending Acceptance', className: 'bg-amber-500/10 text-amber-600', icon: Clock },
  accepted: { label: 'Accepted', className: 'bg-blue-500/10 text-blue-600', icon: CheckCircle2 },
  declined: { label: 'Declined', className: 'bg-destructive/10 text-destructive', icon: XCircle },
  submitted: { label: 'Submitted', className: 'bg-violet-500/10 text-violet-600', icon: Send },
  approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-600', icon: ThumbsUp },
  rejected: { label: 'Rejected', className: 'bg-destructive/10 text-destructive', icon: ThumbsDown },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', className: 'bg-primary/10 text-primary' },
  high: { label: 'High', className: 'bg-amber-500/10 text-amber-600' },
  urgent: { label: 'Urgent', className: 'bg-destructive/10 text-destructive' },
};

// Build a timeline from task metadata
function buildTimeline(task: Task) {
  const steps: Array<{ label: string; date: string | null; status: string; active: boolean }> = [];

  steps.push({ label: 'Created', date: task.created_at, status: 'done', active: false });

  if (task.task_type === 'assigned') {
    const flow = ['pending_accept', 'accepted', 'in_progress', 'submitted', 'approved'];
    const declined = task.status === 'declined';
    const rejected = task.status === 'rejected';
    const currentIdx = flow.indexOf(task.status);

    steps.push({
      label: 'Assigned',
      date: task.created_at,
      status: 'done',
      active: false,
    });

    if (declined) {
      steps.push({ label: 'Declined', date: task.updated_at, status: 'declined', active: true });
      return steps;
    }

    steps.push({
      label: 'Accepted',
      date: currentIdx >= 1 ? task.updated_at : null,
      status: currentIdx >= 1 ? 'done' : (task.status === 'pending_accept' ? 'current' : 'pending'),
      active: task.status === 'pending_accept',
    });

    steps.push({
      label: 'In Progress',
      date: currentIdx >= 2 ? task.updated_at : null,
      status: currentIdx >= 2 ? 'done' : (currentIdx === 1 ? 'current' : 'pending'),
      active: currentIdx === 1,
    });

    if (rejected) {
      steps.push({ label: 'Submitted', date: task.updated_at, status: 'done', active: false });
      steps.push({ label: 'Rejected', date: task.updated_at, status: 'rejected', active: true });
      return steps;
    }

    steps.push({
      label: 'Submitted',
      date: currentIdx >= 3 ? task.updated_at : null,
      status: currentIdx >= 3 ? 'done' : (currentIdx === 2 ? 'current' : 'pending'),
      active: currentIdx === 2,
    });

    steps.push({
      label: 'Approved',
      date: currentIdx >= 4 ? (task.completed_at || task.updated_at) : null,
      status: currentIdx >= 4 ? 'done' : (currentIdx === 3 ? 'current' : 'pending'),
      active: currentIdx === 3,
    });
  } else {
    // Personal task
    const flow = ['todo', 'in_progress', 'done'];
    const currentIdx = flow.indexOf(task.status);

    steps.push({
      label: 'In Progress',
      date: currentIdx >= 1 ? task.updated_at : null,
      status: currentIdx >= 1 ? 'done' : (currentIdx === 0 ? 'current' : 'pending'),
      active: currentIdx === 0,
    });

    steps.push({
      label: 'Done',
      date: currentIdx >= 2 ? (task.completed_at || task.updated_at) : null,
      status: currentIdx >= 2 ? 'done' : (currentIdx === 1 ? 'current' : 'pending'),
      active: currentIdx === 1,
    });
  }

  return steps;
}

function PersonBadge({ person, label }: { person: TaskAssignee | null; label: string }) {
  if (!person) return null;
  const initials = person.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '';

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-7 w-7">
        <AvatarImage src={person.avatarUrl || undefined} alt={person.displayName} />
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials}</AvatarFallback>
      </Avatar>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{person.displayName}</p>
      </div>
    </div>
  );
}

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignee: TaskAssignee | null;
  creator: TaskAssignee | null;
  currentUserId: string;
  onStatusChange: (id: string, status: string, extra?: Record<string, unknown>) => void;
  onActionClick: (action: 'accept' | 'decline' | 'submit' | 'approve' | 'reject') => void;
}

export function TaskDetailSheet({
  task, open, onOpenChange, assignee, creator, currentUserId, onStatusChange, onActionClick,
}: TaskDetailSheetProps) {
  const [commentText, setCommentText] = useState('');
  const { data: activityLogs = [], isLoading: activityLoading } = useTaskActivity(open && task ? task.id : null);
  const { data: comments = [], isLoading: commentsLoading } = useTaskComments(open && task ? task.id : null);
  const addComment = useAddTaskComment();

  if (!task) return null;

  const priority = priorityConfig[task.priority] || priorityConfig.medium;
  const status = statusConfig[task.status] || statusConfig.todo;
  const StatusIcon = status.icon;
  const timeline = buildTimeline(task);
  const isCreator = task.created_by === currentUserId;
  const isAssignee = task.assigned_to === currentUserId;
  const isPersonal = task.task_type === 'personal';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={status.className}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </Badge>
            <Badge variant="outline" className={priority.className}>{priority.label}</Badge>
            {!isPersonal && <Badge variant="secondary" className="text-[10px]">Assigned</Badge>}
          </div>
          <SheetTitle className="text-lg leading-tight">{task.title}</SheetTitle>
          <SheetDescription className="sr-only">Task details for {task.title}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          {/* Description */}
          {task.description && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Description</h4>
              <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          <Separator />

          {/* People */}
          <div className="grid grid-cols-2 gap-4">
            <PersonBadge person={creator} label="Created by" />
            {!isPersonal && <PersonBadge person={assignee} label="Assigned to" />}
          </div>

          <Separator />

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-3">
            <MetaItem icon={Calendar} label="Created" value={format(new Date(task.created_at), 'MMM d, yyyy h:mm a')} />
            {task.due_date && (
              <MetaItem icon={Calendar} label="Due Date" value={format(new Date(task.due_date), 'MMM d, yyyy h:mm a')} />
            )}
            {task.estimated_duration && (
              <MetaItem icon={Clock} label="Est. Duration" value={task.estimated_duration} />
            )}
            {task.actual_duration && (
              <MetaItem icon={Clock} label="Actual Duration" value={task.actual_duration} />
            )}
            {task.completed_at && (
              <MetaItem icon={CheckCircle2} label="Completed" value={format(new Date(task.completed_at), 'MMM d, yyyy h:mm a')} />
            )}
          </div>

          <Separator />

          {/* Status Timeline */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status Timeline</h4>
            <div className="relative pl-6 space-y-0">
              {timeline.map((step, i) => {
                const isLast = i === timeline.length - 1;
                const dotColor =
                  step.status === 'done' ? 'bg-emerald-500'
                  : step.status === 'current' ? 'bg-primary ring-2 ring-primary/30'
                  : step.status === 'declined' || step.status === 'rejected' ? 'bg-destructive'
                  : 'bg-muted-foreground/30';

                return (
                  <div key={i} className="relative pb-4">
                    {/* Connector line */}
                    {!isLast && (
                      <div className="absolute left-[-18px] top-3 w-px h-full bg-border" />
                    )}
                    {/* Dot */}
                    <div className={`absolute left-[-22px] top-1 h-2.5 w-2.5 rounded-full ${dotColor}`} />
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${
                        step.status === 'pending' ? 'text-muted-foreground/50' : 'text-foreground'
                      }`}>
                        {step.label}
                      </span>
                      {step.date && step.status !== 'pending' && (
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(step.date), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Challenges */}
          {task.challenges && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Challenges Faced
                </h4>
                <p className="text-sm text-foreground whitespace-pre-wrap bg-amber-500/5 border border-amber-500/20 rounded-md p-3">
                  {task.challenges}
                </p>
              </div>
            </>
          )}

          {/* Feedback */}
          {task.feedback && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Lead Feedback
                </h4>
                <p className="text-sm text-foreground whitespace-pre-wrap bg-primary/5 border border-primary/20 rounded-md p-3">
                  {task.feedback}
                </p>
              </div>
            </>
          )}

          {/* Decline Reason */}
          {task.decline_reason && (
            <>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> Decline Reason
                </h4>
                <p className="text-sm text-foreground whitespace-pre-wrap bg-destructive/5 border border-destructive/20 rounded-md p-3">
                  {task.decline_reason}
                </p>
              </div>
            </>
          )}

          {/* Activity Log */}
          <Separator />
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
              <History className="h-3 w-3" /> Activity Log
            </h4>
            {activityLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : activityLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {activityLogs.map((log) => {
                  const initials = log.actor_name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() || '';
                  const statusLabel = (s: string | null) =>
                    s ? (statusConfig[s]?.label || s) : '';

                  return (
                    <div key={log.id} className="flex gap-2.5">
                      <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                        <AvatarImage src={log.actor_avatar || undefined} />
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-foreground">{log.actor_name}</span>
                          {log.old_status && log.new_status ? (
                            <span className="text-xs text-muted-foreground">
                              {statusLabel(log.old_status)} → {statusLabel(log.new_status)}
                            </span>
                          ) : log.new_status ? (
                            <span className="text-xs text-muted-foreground">
                              → {statusLabel(log.new_status)}
                            </span>
                          ) : null}
                        </div>
                        {log.note && (
                          <p className="text-xs text-muted-foreground mt-0.5">{log.note}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          {' · '}
                          {format(new Date(log.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pb-4">
            {!isPersonal && isAssignee && task.status === 'pending_accept' && (
              <>
                <Button size="sm" onClick={() => onActionClick('accept')}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onActionClick('decline')}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Decline
                </Button>
              </>
            )}
            {!isPersonal && isAssignee && task.status === 'accepted' && (
              <Button size="sm" onClick={() => { onStatusChange(task.id, 'in_progress'); onOpenChange(false); }}>
                Start Working
              </Button>
            )}
            {!isPersonal && isAssignee && task.status === 'in_progress' && (
              <Button size="sm" onClick={() => onActionClick('submit')}>
                <Send className="h-3.5 w-3.5 mr-1" /> Submit Work
              </Button>
            )}
            {!isPersonal && isAssignee && task.status === 'rejected' && (
              <Button size="sm" onClick={() => { onStatusChange(task.id, 'in_progress'); onOpenChange(false); }}>
                Resume Work
              </Button>
            )}
            {!isPersonal && isCreator && task.status === 'submitted' && (
              <>
                <Button size="sm" onClick={() => onActionClick('approve')}>
                  <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onActionClick('reject')}>
                  <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetaItem({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

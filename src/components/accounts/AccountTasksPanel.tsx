import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ListTodo, Calendar, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog';
import { TaskDetailSheet } from '@/components/tasks/TaskDetailSheet';
import { AcceptDeclineDialog } from '@/components/tasks/AcceptDeclineDialog';
import { SubmitTaskDialog } from '@/components/tasks/SubmitTaskDialog';
import { ReviewTaskDialog } from '@/components/tasks/ReviewTaskDialog';
import { useUpdateTask, useTogglePin, useMarkDone, useMarkUndone, type Task } from '@/hooks/useTasks';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  done: 'bg-emerald-500/10 text-emerald-600',
  approved: 'bg-emerald-500/10 text-emerald-600',
  pending_accept: 'bg-amber-500/10 text-amber-600',
  accepted: 'bg-blue-500/10 text-blue-600',
  declined: 'bg-destructive/10 text-destructive',
  submitted: 'bg-violet-500/10 text-violet-600',
  rejected: 'bg-destructive/10 text-destructive',
};

interface Props {
  accountId: string;
  accountName: string;
}

export function AccountTasksPanel({ accountId, accountName }: Props) {
  const { user, getToken } = useAuth();
  const qc = useQueryClient();
  const { data: directory } = useDirectoryData();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sheetAction, setSheetAction] = useState<'accept' | 'decline' | 'submit' | 'approve' | 'reject' | null>(null);

  const updateTask = useUpdateTask();
  const togglePin = useTogglePin();
  const markDone = useMarkDone();
  const markUndone = useMarkUndone();

  const userMap = new Map(
    (directory || []).map(u => [u.userId, { displayName: u.displayName, avatarUrl: u.avatarUrl }])
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['account-tasks', accountId] });
    qc.invalidateQueries({ queryKey: ['tasks-by-account', accountId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['account-tasks', accountId],
    queryFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'list_by_account', account_id: accountId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data?.tasks || []) as Task[];
    },
    enabled: !!user?.id && !!accountId,
  });

  const createTask = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'create', ...payload, account_id: accountId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.task as Task;
    },
    onSuccess: () => { invalidate(); toast.success('Task created'); },
    onError: (e: Error) => toast.error(e.message || 'Failed to create task'),
  });

  const handleStatusChange = (id: string, status: string, extra?: Record<string, unknown>) => {
    updateTask.mutate({ id, status, ...extra }, {
      onSuccess: () => invalidate(),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update task'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Tasks</h3>
          <Badge variant="outline">{tasks?.length || 0}</Badge>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : !tasks || tasks.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border rounded-md">
          <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No tasks linked to this account yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => {
            const assignee = t.assigned_to ? userMap.get(t.assigned_to) : null;
            const initials = assignee?.displayName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '';
            return (
              <Card key={t.id} className="border cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedTask(t)}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className={STATUS_COLORS[t.status] || ''}>{t.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    {t.due_date && (
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(t.due_date), 'MMM d')}</span>
                    )}
                    {assignee && (
                      <span className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={assignee.avatarUrl || undefined} />
                          <AvatarFallback className="text-[8px]">{initials || <User className="h-2 w-2" />}</AvatarFallback>
                        </Avatar>
                        {assignee.displayName}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddTaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        hideProjectField
        onSubmit={(payload) => {
          const prefix = `From account: ${accountName}`;
          const desc = payload.description ? `${prefix}\n\n${payload.description}` : prefix;
          createTask.mutate({ ...payload, description: desc });
        }}
        isLoading={createTask.isPending}
      />

      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(v) => !v && setSelectedTask(null)}
          assignee={selectedTask.assigned_to ? userMap.get(selectedTask.assigned_to) || null : null}
          creator={userMap.get(selectedTask.created_by) || null}
          currentUserId={user?.id || ''}
          onStatusChange={(id, status, extra) => { handleStatusChange(id, status, extra); setSelectedTask(null); }}
          onActionClick={(action) => setSheetAction(action)}
          onTogglePin={(id) => togglePin.mutate(id, { onSuccess: invalidate })}
          onMarkDone={(id) => markDone.mutate({ id }, { onSuccess: () => { invalidate(); toast.success('Task marked as done'); } })}
          onMarkUndone={(id) => markUndone.mutate(id, { onSuccess: () => { invalidate(); toast.success('Task marked as not done'); } })}
        />
      )}

      {selectedTask && sheetAction && (sheetAction === 'accept' || sheetAction === 'decline') && (
        <AcceptDeclineDialog
          open onOpenChange={() => setSheetAction(null)} mode={sheetAction} taskTitle={selectedTask.title}
          onConfirm={(reason) => {
            handleStatusChange(selectedTask.id, sheetAction === 'accept' ? 'accepted' : 'declined', sheetAction === 'decline' ? { decline_reason: reason } : undefined);
            setSheetAction(null); setSelectedTask(null);
          }}
        />
      )}

      {selectedTask && sheetAction === 'submit' && (
        <SubmitTaskDialog
          open onOpenChange={() => setSheetAction(null)} taskTitle={selectedTask.title}
          onConfirm={(data) => { handleStatusChange(selectedTask.id, 'submitted', data); setSheetAction(null); setSelectedTask(null); }}
        />
      )}

      {selectedTask && sheetAction && (sheetAction === 'approve' || sheetAction === 'reject') && (
        <ReviewTaskDialog
          open onOpenChange={() => setSheetAction(null)} mode={sheetAction} taskTitle={selectedTask.title}
          onConfirm={(feedback) => {
            handleStatusChange(selectedTask.id, sheetAction === 'approve' ? 'approved' : 'rejected', { feedback });
            setSheetAction(null); setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}

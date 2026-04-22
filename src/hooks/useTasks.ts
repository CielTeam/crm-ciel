import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_by: string;
  assigned_to: string | null;
  team_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  task_type: string;
  challenges: string | null;
  estimated_duration: string | null;
  actual_duration: string | null;
  feedback: string | null;
  decline_reason: string | null;
  pinned: boolean;
  sort_order: number;
  started_at: string | null;
  completion_notes: string | null;
  mark_done_by: string | null;
  mark_done_at: string | null;
  mark_undone_by: string | null;
  mark_undone_at: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  ticket_id?: string | null;
  project_id?: string | null;
  project_sort_order?: number;
  assignees?: TaskAssigneeMember[];
}

export interface TaskAssigneeMember {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email?: string | null;
  role?: string | null;
  is_primary: boolean;
}

export interface TaskActivityLog {
  id: string;
  task_id: string;
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  old_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

export type TaskTab = 'my_tasks' | 'assigned' | 'team_tasks' | 'assigned_by_me';

export function useTasksRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const row = (payload.new || payload.old) as { created_by: string; assigned_to: string | null } | null;
          if (row && (row.created_by === user.id || row.assigned_to === user.id)) {
            qc.invalidateQueries({ queryKey: ['tasks'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}

function useTaskInvoke() {
  const { getToken } = useAuth();
  return async (body: Record<string, unknown>) => {
    const token = await getToken();
    const { data, error } = await supabase.functions.invoke('tasks', {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      // Try to extract message from FunctionsHttpError
      const message = (error as any)?.context?.body
        ? await (error as any).context.json().catch(() => null)
        : null;
      throw new Error(message?.error || error.message || 'Request failed');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

export function useTasks(tab: TaskTab = 'my_tasks') {
  const { user } = useAuth();
  const invoke = useTaskInvoke();
  useTasksRealtime();

  return useQuery({
    queryKey: ['tasks', tab, user?.id],
    queryFn: async () => {
      const data = await invoke({ action: 'list', tab });
      return (data.tasks || []) as Task[];
    },
    enabled: !!user?.id,
  });
}

export function useAssignableUsers() {
  const { user } = useAuth();
  const invoke = useTaskInvoke();

  return useQuery({
    queryKey: ['assignable-users', user?.id],
    queryFn: async () => {
      const data = await invoke({ action: 'assignable_users' });
      return (data.users || []) as Array<{
        user_id: string;
        display_name: string;
        avatar_url: string | null;
        email: string | null;
        role: string | null;
      }>;
    },
    enabled: !!user?.id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string | null;
      assigned_to?: string | null;
      assignees?: string[];
      estimated_duration?: string | null;
      lead_id?: string | null;
      account_id?: string | null;
      ticket_id?: string | null;
      project_id?: string | null;
    }) => {
      const data = await invoke({ action: 'create', ...payload });
      return data.task as Task;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (vars.lead_id) qc.invalidateQueries({ queryKey: ['tasks-by-lead', vars.lead_id] });
      if (vars.account_id) qc.invalidateQueries({ queryKey: ['tasks-by-account', vars.account_id] });
      if (vars.project_id) qc.invalidateQueries({ queryKey: ['project-tasks', vars.project_id] });
    },
  });
}

export function useTasksByAccount(accountId: string | null) {
  const { user } = useAuth();
  const invoke = useTaskInvoke();
  return useQuery({
    queryKey: ['tasks-by-account', accountId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_by_account', account_id: accountId });
      return (data.tasks || []) as Task[];
    },
    enabled: !!user?.id && !!accountId,
  });
}

export function useTasksByLead(leadId: string | null) {
  const { user } = useAuth();
  const invoke = useTaskInvoke();

  return useQuery({
    queryKey: ['tasks-by-lead', leadId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_by_lead', lead_id: leadId });
      return (data.tasks || []) as Task[];
    },
    enabled: !!user?.id && !!leadId,
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: { id: string; [key: string]: unknown }) => {
      const data = await invoke({ action: 'update', ...payload });
      return data.task as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await invoke({ action: 'delete', id });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await invoke({ action: 'toggle_pin', id });
      return data.task as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useMarkDone() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: { id: string; completion_notes?: string }) => {
      const data = await invoke({ action: 'mark_done', ...payload });
      return data.task as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useMarkUndone() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (id: string) => {
      const data = await invoke({ action: 'mark_undone', id });
      return data.task as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (task_ids: string[]) => {
      const data = await invoke({ action: 'reorder', task_ids });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useTaskActivity(taskId: string | null) {
  const { user } = useAuth();
  const invoke = useTaskInvoke();

  return useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_activity', task_id: taskId });
      return (data.activity || []) as TaskActivityLog[];
    },
    enabled: !!user?.id && !!taskId,
  });
}

export function useTaskComments(taskId: string | null) {
  const { user } = useAuth();
  const invoke = useTaskInvoke();

  return useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_comments', task_id: taskId });
      return (data.comments || []) as TaskComment[];
    },
    enabled: !!user?.id && !!taskId,
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: { task_id: string; content: string }) => {
      const data = await invoke({ action: 'add_comment', ...payload });
      return data.comment as TaskComment;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['task-comments', variables.task_id] });
      qc.invalidateQueries({ queryKey: ['task-activity', variables.task_id] });
    },
  });
}

export function useReassignTask() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: { task_id: string; new_assigned_to: string }) => {
      const data = await invoke({ action: 'reassign', ...payload });
      return data.task as Task;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-activity', variables.task_id] });
    },
  });
}

export function useAddTaskAssignees() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: { task_id: string; user_ids: string[] }) => {
      const data = await invoke({ action: 'add_assignees', ...payload });
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-activity', variables.task_id] });
    },
  });
}

export function useRemoveTaskAssignee() {
  const qc = useQueryClient();
  const invoke = useTaskInvoke();

  return useMutation({
    mutationFn: async (payload: { task_id: string; user_id: string }) => {
      const data = await invoke({ action: 'remove_assignee', ...payload });
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-activity', variables.task_id] });
    },
  });
}

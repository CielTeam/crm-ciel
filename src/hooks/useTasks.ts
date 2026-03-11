import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Extended task type since DB types may not have new columns yet
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

export type TaskTab = 'my_tasks' | 'assigned' | 'team_tasks';

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
          const row = (payload.new || payload.old) as any;
          // Only invalidate if this user is involved
          if (
            row &&
            (row.created_by === user.id || row.assigned_to === user.id)
          ) {
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

export function useTasks(tab: TaskTab = 'my_tasks') {
  const { user } = useAuth();

  // Subscribe to realtime updates
  useTasksRealtime();

  return useQuery({
    queryKey: ['tasks', tab, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'list', actor_id: user!.id, tab },
      });
      if (error) throw error;
      return (data.tasks || []) as Task[];
    },
    enabled: !!user?.id,
  });
}

export function useAssignableUsers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['assignable-users', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'assignable_users', actor_id: user!.id },
      });
      if (error) throw error;
      return (data.users || []) as Array<{
        user_id: string;
        display_name: string;
        avatar_url: string | null;
      }>;
    },
    enabled: !!user?.id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string | null;
      assigned_to?: string | null;
      estimated_duration?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'create', actor_id: user!.id, ...payload },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.task as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: { id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'update', actor_id: user!.id, ...payload },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.task as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'delete', actor_id: user!.id, id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

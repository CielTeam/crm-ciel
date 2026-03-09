import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

export type Task = Tables<'tasks'>;

type TaskTab = 'my_tasks' | 'assigned';

export function useTasks(tab: TaskTab = 'my_tasks') {
  const { user } = useAuth();

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
    }) => {
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'create', actor_id: user!.id, ...payload },
      });
      if (error) throw error;
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
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ManagementTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string;
  account_id: string | null;
  ticket_id: string | null;
  progress_percent: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  visible_scope: string;
}

export interface AllTasksFilters {
  user_id?: string | null;
  department_id?: string | null;
  status?: string[];
  priority?: string[];
  account_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  search?: string | null;
  page?: number;
  page_size?: number;
}

export function useAllTasks(filters: AllTasksFilters = {}) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['all-tasks', filters, user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'list_management', ...filters },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { tasks: ManagementTask[]; total: number; page: number; page_size: number };
    },
    enabled: !!user?.id,
  });
}

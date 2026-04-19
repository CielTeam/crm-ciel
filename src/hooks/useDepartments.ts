import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Department {
  id: string;
  name: string;
  head_user_id: string | null;
  parent_department_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useDepartments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as Department[];
    },
    enabled: !!user?.id,
  });
}

export function useUpdateProfileHierarchy() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { target_user_id: string; manager_user_id?: string | null; department_id?: string | null }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: { action: 'update_hierarchy', ...payload },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['directory'] });
    },
  });
}

export function useManageDepartment() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload:
      | { action: 'create_department'; name: string; head_user_id?: string | null; parent_department_id?: string | null }
      | { action: 'update_department'; id: string; name?: string; head_user_id?: string | null; parent_department_id?: string | null }
      | { action: 'delete_department'; id: string }
    ) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: payload,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

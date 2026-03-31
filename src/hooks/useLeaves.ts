import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Leave {
  id: string;
  user_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  annual: number;
  sick: number;
  personal: number;
  used_annual: number;
  used_sick: number;
  used_personal: number;
  year: number;
}

export function useLeaves(includeTeam = false) {
  const { user, getToken } = useAuth();

  return useQuery({
    queryKey: ['leaves', user?.id, includeTeam],
    queryFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('leaves', {
        body: { action: 'list', include_team: includeTeam },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return (data.leaves || []) as Leave[];
    },
    enabled: !!user?.id,
  });
}

export function useLeaveBalances() {
  const { user, getToken } = useAuth();

  return useQuery({
    queryKey: ['leave-balances', user?.id],
    queryFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('leaves', {
        body: { action: 'balances' },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data.balances as LeaveBalance;
    },
    enabled: !!user?.id,
  });
}

export function useCreateLeave() {
  const qc = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      leave_type: string;
      start_date: string;
      end_date: string;
      reason?: string;
    }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('leaves', {
        body: { action: 'create', ...payload },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.leave as Leave;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });
}

export function useReviewLeave() {
  const qc = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      leave_id: string;
      decision: 'approved' | 'rejected';
      reviewer_note?: string;
    }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('leaves', {
        body: { action: 'review', ...payload },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.leave as Leave;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (leaveId: string) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('leaves', {
        body: { action: 'cancel', leave_id: leaveId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.leave as Leave;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leaves'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });
}

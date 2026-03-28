import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DashboardStats {
  tier: string;
  openTasks: number;
  pendingLeaves: number;
  unreadMessages: number;
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
  }>;
  // Lead
  teamSize?: number;
  teamOpenTasks?: number;
  teamOverdue?: number;
  teamPendingLeaves?: number;
  teamWorkload?: Array<{
    userId: string;
    displayName: string;
    avatarUrl?: string;
    openTasks: number;
  }>;
  pendingApprovals?: Array<{
    id: string;
    user_id: string;
    leave_type: string;
    status: string;
    start_date: string;
    end_date: string;
    displayName?: string;
  }>;
  // HR
  totalEmployees?: number;
  orgPendingLeaves?: number;
  approvedThisMonth?: number;
  onLeaveToday?: number;
  leaveByType?: Record<string, number>;
  pendingLeaveList?: Array<unknown>;
  // Executive
  totalDepartments?: number;
  orgOpenTasks?: number;
  orgOverdueCritical?: number;
  departments?: Array<{
    id: string;
    name: string;
    department: string;
    memberCount: number;
    openTasks: number;
    overdueTasks: number;
    pendingLeaves: number;
  }>;
  escalations?: Array<{
    id: string;
    title: string;
    priority: string;
    due_date: string | null;
    assigneeName: string;
  }>;
  // Driver
  assignedTasks?: number;
  inProgress?: number;
  completedToday?: number;
  driverTasks?: Array<unknown>;
}

export function useDashboardStats() {
  const { user } = useAuth();

  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('dashboard-stats', {
        body: { actor_id: user!.id },
      });
      if (error) throw error;
      return data as DashboardStats;
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });
}

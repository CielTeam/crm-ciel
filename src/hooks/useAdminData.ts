import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/roles';
import { ROLE_LABELS, ROLE_DEPARTMENT } from '@/types/roles';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

export interface AdminUser {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: AppRole | null;
  roleLabel: string;
  department: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  teamName: string | null;
}

export interface AdminTeam {
  id: string;
  name: string;
  department: string;
  leadUserId: string | null;
  leadName: string | null;
  memberCount: number;
  createdAt: string;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUser[]> => {
      // Fetch ALL profiles including soft-deleted
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*');
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase.from('user_roles').select('*');
      if (rErr) throw rErr;

      const { data: teams, error: tErr } = await supabase.from('teams').select('*');
      if (tErr) throw tErr;

      const roleMap = new Map(roles?.map(r => [r.user_id, r.role as AppRole]));
      const teamMap = new Map(teams?.map(t => [t.id, t.name]));

      return (profiles || []).map(p => {
        const role = roleMap.get(p.user_id) || null;
        return {
          id: p.id,
          userId: p.user_id,
          displayName: p.display_name || p.email || 'Unknown',
          email: p.email || '',
          role,
          roleLabel: role ? ROLE_LABELS[role] : 'No Role',
          department: role ? ROLE_DEPARTMENT[role] : 'unassigned',
          status: p.deleted_at ? 'deactivated' : p.status,
          deletedAt: p.deleted_at,
          createdAt: p.created_at,
          teamName: p.team_id ? teamMap.get(p.team_id) || null : null,
        };
      });
    },
  });
}

export function useAdminTeams() {
  return useQuery({
    queryKey: ['admin-teams'],
    queryFn: async (): Promise<AdminTeam[]> => {
      const { data: teams, error: tErr } = await supabase.from('teams').select('*').is('deleted_at', null);
      if (tErr) throw tErr;

      const { data: members, error: mErr } = await supabase.from('team_members').select('*');
      if (mErr) throw mErr;

      const { data: profiles, error: pErr } = await supabase.from('profiles').select('user_id, display_name').is('deleted_at', null);
      if (pErr) throw pErr;

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]));
      const memberCounts = new Map<string, number>();
      members?.forEach(m => memberCounts.set(m.team_id, (memberCounts.get(m.team_id) || 0) + 1));

      return (teams || []).map(t => ({
        id: t.id,
        name: t.name,
        department: t.department,
        leadUserId: t.lead_user_id,
        leadName: t.lead_user_id ? profileMap.get(t.lead_user_id) || null : null,
        memberCount: memberCounts.get(t.id) || 0,
        createdAt: t.created_at,
      }));
    },
  });
}

type AdminAction = 
  | { action: 'create_user'; email: string; display_name: string; role: AppRole }
  | { action: 'update_role'; target_user_id: string; new_role: AppRole }
  | { action: 'deactivate_user'; target_user_id: string }
  | { action: 'reactivate_user'; target_user_id: string }
  | { action: 'create_team'; name: string; department: string }
  | { action: 'assign_team'; target_user_id: string; team_id: string }
  | { action: 'remove_team_member'; target_user_id: string; team_id: string };

export function useAdminAction() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: AdminAction) => {
      const { data, error } = await supabase.functions.invoke('admin-manage-user', {
        body: { ...payload, actor_id: user?.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-teams'] });
      qc.invalidateQueries({ queryKey: ['directory'] });
      qc.invalidateQueries({ queryKey: ['audit-logs'] });
      const msgs: Record<string, string> = {
        create_user: 'User created successfully',
        update_role: 'Role updated successfully',
        deactivate_user: 'User deactivated',
        reactivate_user: 'User reactivated',
        create_team: 'Team created successfully',
        assign_team: 'Team assignment updated',
        remove_team_member: 'Team member removed',
      };
      toast({ title: msgs[vars.action] || 'Action completed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

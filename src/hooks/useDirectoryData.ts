import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/types/roles';
import { ROLE_DEPARTMENT, ROLE_LABELS } from '@/types/roles';

export interface DirectoryUser {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  role: AppRole | null;
  roleLabel: string;
  department: string;
  teamName: string | null;
  createdAt: string;
}

export function useDirectoryData() {
  return useQuery({
    queryKey: ['directory'],
    queryFn: async (): Promise<DirectoryUser[]> => {
      // Fetch profiles
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .is('deleted_at', null)
        .eq('status', 'active');

      if (pErr) throw pErr;

      // Fetch roles
      const { data: roles, error: rErr } = await supabase
        .from('user_roles')
        .select('*');

      if (rErr) throw rErr;

      // Fetch teams
      const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .is('deleted_at', null);

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
          phone: p.phone,
          avatarUrl: p.avatar_url,
          status: p.status,
          role,
          roleLabel: role ? ROLE_LABELS[role] : 'No Role',
          department: role ? ROLE_DEPARTMENT[role] : 'unassigned',
          teamName: p.team_id ? teamMap.get(p.team_id) || null : null,
          createdAt: p.created_at,
        };
      });
    },
  });
}

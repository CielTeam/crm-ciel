import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXECUTIVE_ROLES = ['chairman', 'vice_president'];
const LEAD_ROLES = ['head_of_operations', 'team_development_lead', 'technical_lead', 'head_of_accounting', 'head_of_marketing', 'sales_lead'];

function getTier(roles: string[]): string {
  for (const r of roles) {
    if (EXECUTIVE_ROLES.includes(r)) return 'executive';
    if (r === 'hr') return 'hr';
    if (LEAD_ROLES.includes(r)) return 'lead';
    if (r === 'driver') return 'driver';
  }
  return 'employee';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { actor_id } = await req.json();
    if (!actor_id) return new Response(JSON.stringify({ error: 'actor_id required' }), { status: 400, headers: corsHeaders });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user roles
    const { data: userRoles } = await sb.from('user_roles').select('role').eq('user_id', actor_id);
    const roles = (userRoles || []).map((r: unknown) => r.role);
    const tier = getTier(roles);

    // Get user's team info
    const { data: profile } = await sb.from('profiles').select('team_id').eq('user_id', actor_id).single();
    const teamId = profile?.team_id;

    // Base personal stats (all tiers get these)
    const { data: myTasks } = await sb.from('tasks').select('id, status, priority, title, due_date, assigned_to, created_by')
      .or(`created_by.eq.${actor_id},assigned_to.eq.${actor_id}`);
    
    const openTasks = (myTasks || []).filter(t => t.status !== 'done').length;

    const { data: myLeaves } = await sb.from('leaves').select('id, status, leave_type')
      .eq('user_id', actor_id).is('deleted_at', null);
    const pendingLeaves = (myLeaves || []).filter(l => l.status === 'pending').length;

    const { data: unreadNotifs } = await sb.from('notifications').select('id')
      .eq('user_id', actor_id).eq('is_read', false).is('deleted_at', null);
    const unreadCount = (unreadNotifs || []).length;

    const recentTasks = (myTasks || [])
      .sort((a: unknown, b: unknown) => (b.due_date || '').localeCompare(a.due_date || ''))
      .slice(0, 5);

    const base = { openTasks, pendingLeaves, unreadMessages: unreadCount, recentTasks, tier };

    if (tier === 'employee') {
      return new Response(JSON.stringify(base), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tier === 'driver') {
      const driverTasks = (myTasks || []).filter(t => t.assigned_to === actor_id);
      const inProgress = driverTasks.filter(t => t.status === 'in_progress').length;
      const today = new Date().toISOString().split('T')[0];
      const completedToday = driverTasks.filter(t => t.status === 'done' && t.due_date?.startsWith(today)).length;
      return new Response(JSON.stringify({
        ...base,
        assignedTasks: driverTasks.length,
        inProgress,
        completedToday,
        driverTasks: driverTasks.slice(0, 10),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Lead / HR / Executive need org data
    const { data: allProfiles } = await sb.from('profiles').select('user_id, display_name, team_id, status, avatar_url')
      .is('deleted_at', null).eq('status', 'active');
    const { data: allTeams } = await sb.from('teams').select('id, name, department, lead_user_id')
      .is('deleted_at', null);
    const { data: allTeamMembers } = await sb.from('team_members').select('user_id, team_id');
    const { data: allTasks } = await sb.from('tasks').select('id, status, priority, assigned_to, created_by, team_id, due_date, title');
    const { data: allLeaves } = await sb.from('leaves').select('id, status, leave_type, user_id, start_date, end_date')
      .is('deleted_at', null);

    const now = new Date();

    if (tier === 'lead') {
      // Team-scoped data
      const teamMemberIds = (allTeamMembers || []).filter(m => m.team_id === teamId).map(m => m.user_id);
      const teamTasks = (allTasks || []).filter(t => teamMemberIds.includes(t.assigned_to || '') || teamMemberIds.includes(t.created_by));
      const teamOpenTasks = teamTasks.filter(t => t.status !== 'done').length;
      const teamOverdue = teamTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length;
      const teamLeaves = (allLeaves || []).filter(l => teamMemberIds.includes(l.user_id));
      const teamPendingLeaves = teamLeaves.filter(l => l.status === 'pending').length;

      const teamWorkload = teamMemberIds.map(uid => {
        const p = (allProfiles || []).find(pr => pr.user_id === uid);
        const taskCount = teamTasks.filter(t => t.assigned_to === uid && t.status !== 'done').length;
        return { userId: uid, displayName: p?.display_name || 'Unknown', avatarUrl: p?.avatar_url, openTasks: taskCount };
      });

      const pendingApprovals = teamLeaves.filter(l => l.status === 'pending').slice(0, 5);

      return new Response(JSON.stringify({
        ...base,
        teamSize: teamMemberIds.length,
        teamOpenTasks,
        teamOverdue,
        teamPendingLeaves,
        teamWorkload,
        pendingApprovals,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tier === 'hr') {
      const totalEmployees = (allProfiles || []).length;
      const allPendingLeaves = (allLeaves || []).filter(l => l.status === 'pending');
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const approvedThisMonth = (allLeaves || []).filter(l => l.status === 'approved' && l.start_date?.startsWith(thisMonth)).length;

      const leaveByType: Record<string, number> = {};
      for (const l of allLeaves || []) {
        leaveByType[l.leave_type] = (leaveByType[l.leave_type] || 0) + 1;
      }

      // Coverage: count people on leave today
      const todayStr = now.toISOString().split('T')[0];
      const onLeaveToday = (allLeaves || []).filter(l => l.status === 'approved' && l.start_date <= todayStr && l.end_date >= todayStr).length;

      return new Response(JSON.stringify({
        ...base,
        totalEmployees,
        orgPendingLeaves: allPendingLeaves.length,
        approvedThisMonth,
        onLeaveToday,
        leaveByType,
        pendingLeaveList: allPendingLeaves.slice(0, 8).map(l => {
          const p = (allProfiles || []).find(pr => pr.user_id === l.user_id);
          return { ...l, displayName: p?.display_name || 'Unknown' };
        }),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Executive tier
    const totalEmployees = (allProfiles || []).length;
    const orgOpenTasks = (allTasks || []).filter(t => t.status !== 'done').length;
    const orgPendingLeaves = (allLeaves || []).filter(l => l.status === 'pending').length;
    const orgOverdueCritical = (allTasks || []).filter(t => t.status !== 'done' && t.priority === 'critical' && t.due_date && new Date(t.due_date) < now).length;

    const departments = (allTeams || []).map(team => {
      const memberIds = (allTeamMembers || []).filter(m => m.team_id === team.id).map(m => m.user_id);
      const deptTasks = (allTasks || []).filter(t => memberIds.includes(t.assigned_to || '') || memberIds.includes(t.created_by));
      const deptLeaves = (allLeaves || []).filter(l => memberIds.includes(l.user_id));
      return {
        id: team.id,
        name: team.name,
        department: team.department,
        memberCount: memberIds.length,
        openTasks: deptTasks.filter(t => t.status !== 'done').length,
        overdueTasks: deptTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length,
        pendingLeaves: deptLeaves.filter(l => l.status === 'pending').length,
      };
    });

    const escalations = (allTasks || [])
      .filter(t => t.status !== 'done' && t.priority === 'critical' && t.due_date && new Date(t.due_date) < now)
      .slice(0, 5)
      .map(t => {
        const p = (allProfiles || []).find(pr => pr.user_id === (t.assigned_to || t.created_by));
        return { ...t, assigneeName: p?.display_name || 'Unassigned' };
      });

    return new Response(JSON.stringify({
      ...base,
      totalEmployees,
      totalDepartments: (allTeams || []).length,
      orgOpenTasks,
      orgPendingLeaves,
      orgOverdueCritical,
      departments,
      escalations,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

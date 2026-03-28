import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type UserRoleRow = {
  role: string;
};

type TeamRow = {
  id: string;
};

type TeamMemberRow = {
  user_id: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  email?: string;
};

type TaskActivityLog = {
  actor_id: string;
};

type Task = {
  id: string;
  created_by: string;
  assigned_to: string | null;
  status: string;
  task_type: string;
  title: string;
};

async function getActorRoles(
  client: ReturnType<typeof createClient>,
  actorId: string
): Promise<string[]> {
  const { data } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', actorId);

  return (data as UserRoleRow[] | null)?.map(r => r.role) ?? [];
}

async function getActorTeamMemberIds(
  client: ReturnType<typeof createClient>,
  actorId: string
): Promise<string[]> {
  const { data: teams } = await client
    .from('teams')
    .select('id')
    .eq('lead_user_id', actorId)
    .is('deleted_at', null);

  if (!teams?.length) return [];

  const teamIds = (teams as TeamRow[]).map(t => t.id);

  const { data: members } = await client
    .from('team_members')
    .select('user_id')
    .in('team_id', teamIds);

  return (members as TeamMemberRow[] | null)
    ?.map(m => m.user_id)
    .filter(uid => uid !== actorId) ?? [];
}

async function logActivity(
  client: ReturnType<typeof createClient>,
  taskId: string,
  actorId: string,
  oldStatus: string | null,
  newStatus: string | null,
  note?: string | null
) {
  await client.from('task_activity_logs').insert({
    task_id: taskId,
    actor_id: actorId,
    old_status: oldStatus,
    new_status: newStatus,
    note: note ?? null,
  });
}
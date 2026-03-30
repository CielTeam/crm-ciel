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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LEAD_ROLES = [
  'chairman', 'vice_president', 'hr',
  'head_of_operations', 'team_development_lead', 'technical_lead',
  'head_of_accounting', 'head_of_marketing', 'sales_lead',
];

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

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, actor_id, ...payload } = body;

    if (!actor_id) {
      return jsonResponse({ error: 'Missing actor_id' }, 400);
    }

    // ─── LIST ───
    if (action === 'list') {
      const { tab = 'my_tasks' } = payload;
      const roles = await getActorRoles(admin, actor_id);
      const isLead = roles.some(r => LEAD_ROLES.includes(r));

      let query = admin.from('tasks').select('*');

      if (tab === 'my_tasks') {
        query = query.eq('created_by', actor_id);
      } else if (tab === 'assigned') {
        query = query.eq('assigned_to', actor_id);
      } else if (tab === 'team_tasks' && isLead) {
        const memberIds = await getActorTeamMemberIds(admin, actor_id);
        if (memberIds.length === 0) {
          return jsonResponse({ tasks: [] });
        }
        query = query.or(
          memberIds.map(id => `assigned_to.eq.${id}`).join(',') +
          ',' +
          memberIds.map(id => `created_by.eq.${id}`).join(',')
        );
      } else {
        query = query.or(`created_by.eq.${actor_id},assigned_to.eq.${actor_id}`);
      }

      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;

      return jsonResponse({ tasks: data || [] });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const { title, description, priority, due_date, assigned_to, estimated_duration } = payload;

      if (!title?.trim()) {
        return jsonResponse({ error: 'Title is required' }, 400);
      }

      const taskType = assigned_to && assigned_to !== actor_id ? 'assigned' : 'personal';

      const { data, error } = await admin.from('tasks').insert({
        title: title.trim(),
        description: description || null,
        priority: priority || 'medium',
        due_date: due_date || null,
        assigned_to: assigned_to || null,
        estimated_duration: estimated_duration || null,
        created_by: actor_id,
        task_type: taskType,
      }).select().single();

      if (error) throw error;

      await logActivity(admin, data.id, actor_id, null, 'todo', 'Task created');

      // Notify assignee
      if (assigned_to && assigned_to !== actor_id) {
        await admin.from('notifications').insert({
          user_id: assigned_to,
          type: 'task_assigned',
          title: 'New task assigned to you',
          body: title.trim(),
          reference_id: data.id,
          reference_type: 'task',
        });
      }

      return jsonResponse({ task: data }, 201);
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, ...updates } = payload;

      if (!id) {
        return jsonResponse({ error: 'Task id is required' }, 400);
      }

      const { data: existing } = await admin.from('tasks').select('*').eq('id', id).single();
      if (!existing) {
        return jsonResponse({ error: 'Task not found' }, 404);
      }

      // Check permission
      if (existing.created_by !== actor_id && existing.assigned_to !== actor_id) {
        const roles = await getActorRoles(admin, actor_id);
        if (!roles.some(r => LEAD_ROLES.includes(r))) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
      }

      const oldStatus = existing.status;
      const updatePayload: Record<string, unknown> = {};

      const allowedFields = [
        'title', 'description', 'priority', 'due_date', 'status',
        'challenges', 'estimated_duration', 'actual_duration', 'feedback',
        'decline_reason', 'completed_at',
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updatePayload[field] = updates[field];
        }
      }

      if (updatePayload.status === 'done' && !updatePayload.completed_at) {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { data, error } = await admin.from('tasks').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      if (updatePayload.status && updatePayload.status !== oldStatus) {
        await logActivity(admin, id, actor_id, oldStatus, updatePayload.status as string);

        // Notify relevant party
        const notifyUserId = existing.created_by === actor_id ? existing.assigned_to : existing.created_by;
        if (notifyUserId) {
          await admin.from('notifications').insert({
            user_id: notifyUserId,
            type: 'task_status_changed',
            title: `Task status changed to ${updatePayload.status}`,
            body: existing.title,
            reference_id: id,
            reference_type: 'task',
          });
        }
      }

      return jsonResponse({ task: data });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { id } = payload;

      if (!id) {
        return jsonResponse({ error: 'Task id is required' }, 400);
      }

      const { data: existing } = await admin.from('tasks').select('created_by').eq('id', id).single();
      if (!existing || existing.created_by !== actor_id) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const { error } = await admin.from('tasks').delete().eq('id', id);
      if (error) throw error;

      return jsonResponse({ success: true });
    }

    // ─── ASSIGNABLE USERS ───
    if (action === 'assignable_users') {
      const roles = await getActorRoles(admin, actor_id);
      const isLead = roles.some(r => LEAD_ROLES.includes(r));

      let userIds: string[] = [];

      if (isLead) {
        const memberIds = await getActorTeamMemberIds(admin, actor_id);
        userIds = memberIds;
      }

      // Everyone can assign to themselves
      if (!userIds.includes(actor_id)) {
        userIds.push(actor_id);
      }

      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, display_name, avatar_url, email')
        .in('user_id', userIds)
        .is('deleted_at', null);

      // Get roles for each user
      const { data: userRoles } = await admin
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      const roleMap = new Map((userRoles as { user_id: string; role: string }[] || []).map(r => [r.user_id, r.role]));

      const users = (profiles as ProfileRow[] || []).map(p => ({
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        email: p.email || null,
        role: roleMap.get(p.user_id) || null,
      }));

      return jsonResponse({ users });
    }

    // ─── LIST ACTIVITY ───
    if (action === 'list_activity') {
      const { task_id } = payload;

      if (!task_id) {
        return jsonResponse({ error: 'task_id is required' }, 400);
      }

      const { data: logs, error } = await admin
        .from('task_activity_logs')
        .select('*')
        .eq('task_id', task_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Enrich with actor names
      const actorIds = [...new Set((logs || []).map((l: TaskActivityLog) => l.actor_id))];
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', actorIds);

      const profileMap = new Map((profiles as ProfileRow[] || []).map(p => [p.user_id, p]));

      const activity = (logs || []).map((l: Record<string, unknown>) => ({
        ...l,
        actor_name: (profileMap.get(l.actor_id as string) as ProfileRow | undefined)?.display_name || 'Unknown',
        actor_avatar: (profileMap.get(l.actor_id as string) as ProfileRow | undefined)?.avatar_url || null,
      }));

      return jsonResponse({ activity });
    }

    // ─── ADD COMMENT ───
    if (action === 'add_comment') {
      const { task_id, content } = payload;

      if (!task_id || !content?.trim()) {
        return jsonResponse({ error: 'task_id and content are required' }, 400);
      }

      const { data: task } = await admin.from('tasks').select('created_by, assigned_to').eq('id', task_id).single();
      if (!task || (task.created_by !== actor_id && task.assigned_to !== actor_id)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const { data, error } = await admin.from('task_comments').insert({
        task_id,
        author_id: actor_id,
        content: content.trim(),
      }).select().single();

      if (error) throw error;

      await logActivity(admin, task_id, actor_id, null, null, `Comment: ${content.trim().substring(0, 100)}`);

      // Get author info for response
      const { data: profile } = await admin.from('profiles').select('display_name, avatar_url').eq('user_id', actor_id).single();

      return jsonResponse({
        comment: {
          ...data,
          author_name: (profile as ProfileRow | null)?.display_name || 'Unknown',
          author_avatar: (profile as ProfileRow | null)?.avatar_url || null,
        },
      }, 201);
    }

    // ─── LIST COMMENTS ───
    if (action === 'list_comments') {
      const { task_id } = payload;

      if (!task_id) {
        return jsonResponse({ error: 'task_id is required' }, 400);
      }

      const { data: comments, error } = await admin
        .from('task_comments')
        .select('*')
        .eq('task_id', task_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const authorIds = [...new Set((comments || []).map((c: { author_id: string }) => c.author_id))];
      const { data: profiles } = await admin
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', authorIds);

      const profileMap = new Map((profiles as ProfileRow[] || []).map(p => [p.user_id, p]));

      const enriched = (comments || []).map((c: Record<string, unknown>) => ({
        ...c,
        author_name: (profileMap.get(c.author_id as string) as ProfileRow | undefined)?.display_name || 'Unknown',
        author_avatar: (profileMap.get(c.author_id as string) as ProfileRow | undefined)?.avatar_url || null,
      }));

      return jsonResponse({ comments: enriched });
    }

    // ─── REASSIGN ───
    if (action === 'reassign') {
      const { task_id, new_assigned_to } = payload;

      if (!task_id || !new_assigned_to) {
        return jsonResponse({ error: 'task_id and new_assigned_to are required' }, 400);
      }

      const { data: task } = await admin.from('tasks').select('*').eq('id', task_id).single();
      if (!task) {
        return jsonResponse({ error: 'Task not found' }, 404);
      }

      // Only task creator or lead can reassign
      if (task.created_by !== actor_id) {
        const roles = await getActorRoles(admin, actor_id);
        if (!roles.some(r => LEAD_ROLES.includes(r))) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
      }

      const oldAssignee = task.assigned_to;
      const { data, error } = await admin.from('tasks').update({
        assigned_to: new_assigned_to,
        task_type: new_assigned_to !== task.created_by ? 'assigned' : 'personal',
      }).eq('id', task_id).select().single();

      if (error) throw error;

      await logActivity(admin, task_id, actor_id, null, null, `Reassigned from ${oldAssignee || 'unassigned'} to ${new_assigned_to}`);

      // Notify new assignee
      if (new_assigned_to !== actor_id) {
        await admin.from('notifications').insert({
          user_id: new_assigned_to,
          type: 'task_assigned',
          title: 'A task has been reassigned to you',
          body: task.title,
          reference_id: task_id,
          reference_type: 'task',
        });
      }

      return jsonResponse({ task: data });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('tasks error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

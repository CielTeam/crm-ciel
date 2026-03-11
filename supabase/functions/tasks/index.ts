import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GLOBAL_ASSIGNER_ROLES = [
  'chairman', 'vice_president', 'hr', 'head_of_operations',
];

const LEAD_ROLES = [
  'head_of_accounting', 'head_of_marketing', 'sales_lead',
  'technical_lead', 'team_development_lead',
];

async function getActorRoles(client: any, actorId: string): Promise<string[]> {
  const { data } = await client.from('user_roles').select('role').eq('user_id', actorId);
  return (data || []).map((r: any) => r.role);
}

async function getActorTeamMemberIds(client: any, actorId: string): Promise<string[]> {
  // Find teams where actor is lead
  const { data: teams } = await client.from('teams').select('id').eq('lead_user_id', actorId).is('deleted_at', null);
  if (!teams || teams.length === 0) return [];

  const teamIds = teams.map((t: any) => t.id);
  const { data: members } = await client.from('team_members').select('user_id').in('team_id', teamIds);
  return (members || []).map((m: any) => m.user_id).filter((uid: string) => uid !== actorId);
}

function isGlobalAssigner(roles: string[]): boolean {
  return roles.some((r) => GLOBAL_ASSIGNER_ROLES.includes(r));
}

function isLead(roles: string[]): boolean {
  return roles.some((r) => LEAD_ROLES.includes(r));
}

// Valid status transitions
const PERSONAL_TRANSITIONS: Record<string, string[]> = {
  todo: ['in_progress', 'done'],
  in_progress: ['todo', 'done'],
  done: ['todo', 'in_progress'],
};

const ASSIGNED_TRANSITIONS_ASSIGNEE: Record<string, string[]> = {
  pending_accept: ['accepted', 'declined'],
  accepted: ['in_progress'],
  in_progress: ['submitted'],
  rejected: ['in_progress'],
};

const ASSIGNED_TRANSITIONS_CREATOR: Record<string, string[]> = {
  submitted: ['approved', 'rejected'],
};

async function logActivity(
  client: any,
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
    note: note || null,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, actor_id, ...payload } = body;

    if (!actor_id) {
      return new Response(JSON.stringify({ error: 'Missing actor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── LIST ────────────────────────────────────────────────
    if (action === 'list') {
      const { tab } = payload; // 'my_tasks' | 'assigned' | 'team_tasks'
      let query = adminClient.from('tasks').select('*');

      if (tab === 'assigned') {
        query = query.eq('assigned_to', actor_id);
      } else if (tab === 'team_tasks') {
        // Tasks created by this actor (assigned to others) OR tasks assigned to their team members
        const roles = await getActorRoles(adminClient, actor_id);
        if (isGlobalAssigner(roles)) {
          // Global assigners see all assigned tasks they created
          query = query.eq('created_by', actor_id).neq('task_type', 'personal');
        } else if (isLead(roles)) {
          const memberIds = await getActorTeamMemberIds(adminClient, actor_id);
          // Tasks assigned to team members OR created by this lead for others
          query = query.or(
            `assigned_to.in.(${memberIds.join(',')}),and(created_by.eq.${actor_id},task_type.eq.assigned)`
          );
        } else {
          // Non-leads don't have team tasks
          return new Response(JSON.stringify({ tasks: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        // my_tasks: tasks I created for myself (personal)
        query = query.eq('created_by', actor_id).eq('task_type', 'personal');
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ tasks: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── ASSIGNABLE USERS ────────────────────────────────────
    if (action === 'assignable_users') {
      const roles = await getActorRoles(adminClient, actor_id);

      if (isGlobalAssigner(roles)) {
        // Can assign to anyone
        const { data } = await adminClient.from('profiles')
          .select('user_id, display_name, avatar_url')
          .is('deleted_at', null)
          .neq('user_id', actor_id)
          .order('display_name');
        return new Response(JSON.stringify({ users: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (isLead(roles)) {
        const memberIds = await getActorTeamMemberIds(adminClient, actor_id);
        if (memberIds.length === 0) {
          return new Response(JSON.stringify({ users: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data } = await adminClient.from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', memberIds)
          .is('deleted_at', null)
          .order('display_name');
        return new Response(JSON.stringify({ users: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Employees can't assign
      return new Response(JSON.stringify({ users: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── LIST ACTIVITY ───────────────────────────────────────
    if (action === 'list_activity') {
      const { task_id } = payload;
      if (!task_id) throw new Error('Missing task_id');

      // Verify actor has access to this task
      const { data: task } = await adminClient.from('tasks')
        .select('created_by, assigned_to')
        .eq('id', task_id)
        .single();

      if (!task || (task.created_by !== actor_id && task.assigned_to !== actor_id)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: logs, error } = await adminClient
        .from('task_activity_logs')
        .select('*')
        .eq('task_id', task_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Resolve actor names
      const actorIds = [...new Set((logs || []).map((l: any) => l.actor_id))];
      const { data: profiles } = await adminClient.from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', actorIds);

      const profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
      (profiles || []).forEach((p: any) => {
        profileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      });

      const enriched = (logs || []).map((l: any) => ({
        ...l,
        actor_name: profileMap[l.actor_id]?.display_name || 'Unknown',
        actor_avatar: profileMap[l.actor_id]?.avatar_url || null,
      }));

      return new Response(JSON.stringify({ activity: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── CREATE ──────────────────────────────────────────────
    if (action === 'create') {
      const { title, description, priority, due_date, assigned_to, team_id, estimated_duration } = payload;

      const isAssigned = assigned_to && assigned_to !== actor_id;

      // Validate assignment permissions
      if (isAssigned) {
        const roles = await getActorRoles(adminClient, actor_id);
        if (!isGlobalAssigner(roles)) {
          if (isLead(roles)) {
            const memberIds = await getActorTeamMemberIds(adminClient, actor_id);
            if (!memberIds.includes(assigned_to)) {
              return new Response(JSON.stringify({ error: 'You can only assign tasks to your team members' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } else {
            return new Response(JSON.stringify({ error: 'You do not have permission to assign tasks' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      const { data, error } = await adminClient.from('tasks').insert({
        title,
        description: description || null,
        priority: priority || 'medium',
        due_date: due_date || null,
        assigned_to: isAssigned ? assigned_to : null,
        team_id: team_id || null,
        created_by: actor_id,
        status: isAssigned ? 'pending_accept' : 'todo',
        task_type: isAssigned ? 'assigned' : 'personal',
        estimated_duration: estimated_duration || null,
      }).select().single();

      if (error) throw error;

      // Notify assignee
      if (isAssigned) {
        const { data: creatorProfile } = await adminClient.from('profiles')
          .select('display_name')
          .eq('user_id', actor_id)
          .single();
        const creatorName = creatorProfile?.display_name || 'Someone';

        await adminClient.from('notifications').insert({
          user_id: data.assigned_to,
          type: 'task_assigned',
          title: `New task from ${creatorName}: ${data.title}`,
          body: data.description || null,
          reference_id: data.id,
          reference_type: 'task',
        });
      }

      return new Response(JSON.stringify({ task: data }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── UPDATE ──────────────────────────────────────────────
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) throw new Error('Missing task id');

      const { data: existing } = await adminClient.from('tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isCreator = existing.created_by === actor_id;
      const isAssignee = existing.assigned_to === actor_id;

      if (!isCreator && !isAssignee) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate status transitions
      if (updates.status) {
        const currentStatus = existing.status;
        const newStatus = updates.status;
        let valid = false;

        if (existing.task_type === 'personal' && isCreator) {
          valid = (PERSONAL_TRANSITIONS[currentStatus] || []).includes(newStatus);
        } else if (existing.task_type === 'assigned') {
          if (isAssignee) {
            valid = (ASSIGNED_TRANSITIONS_ASSIGNEE[currentStatus] || []).includes(newStatus);
          }
          if (!valid && isCreator) {
            valid = (ASSIGNED_TRANSITIONS_CREATOR[currentStatus] || []).includes(newStatus);
          }
        }

        if (!valid) {
          return new Response(JSON.stringify({
            error: `Invalid transition: ${currentStatus} → ${newStatus}`,
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Handle special status side effects
        if (newStatus === 'approved' || newStatus === 'done') {
          updates.completed_at = new Date().toISOString();
        } else {
          updates.completed_at = null;
        }

        if (newStatus === 'declined' && !updates.decline_reason) {
          return new Response(JSON.stringify({ error: 'decline_reason is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (newStatus === 'rejected' && !updates.feedback) {
          return new Response(JSON.stringify({ error: 'feedback is required when rejecting' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Only allow certain fields to be updated
      const allowedFields = [
        'status', 'title', 'description', 'priority', 'due_date',
        'challenges', 'actual_duration', 'estimated_duration',
        'feedback', 'decline_reason', 'completed_at',
      ];
      const sanitized: Record<string, unknown> = {};
      for (const key of allowedFields) {
        if (key in updates) sanitized[key] = updates[key];
      }

      const { data, error } = await adminClient.from('tasks')
        .update(sanitized)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Notifications
      const newStatus = updates.status;
      if (newStatus) {
        const { data: actorProfile } = await adminClient.from('profiles')
          .select('display_name')
          .eq('user_id', actor_id)
          .single();
        const actorName = actorProfile?.display_name || 'Someone';

        let notifyUserId: string | null = null;
        let notifTitle = '';

        if (newStatus === 'accepted' && existing.created_by !== actor_id) {
          notifyUserId = existing.created_by;
          notifTitle = `${actorName} accepted your task: ${existing.title}`;
        } else if (newStatus === 'declined' && existing.created_by !== actor_id) {
          notifyUserId = existing.created_by;
          notifTitle = `${actorName} declined your task: ${existing.title}`;
        } else if (newStatus === 'submitted' && existing.created_by !== actor_id) {
          notifyUserId = existing.created_by;
          notifTitle = `${actorName} submitted task for review: ${existing.title}`;
        } else if (newStatus === 'approved' && existing.assigned_to && existing.assigned_to !== actor_id) {
          notifyUserId = existing.assigned_to;
          notifTitle = `${actorName} approved your task: ${existing.title}`;
        } else if (newStatus === 'rejected' && existing.assigned_to && existing.assigned_to !== actor_id) {
          notifyUserId = existing.assigned_to;
          notifTitle = `${actorName} sent back your task: ${existing.title}`;
        }

        if (notifyUserId) {
          await adminClient.from('notifications').insert({
            user_id: notifyUserId,
            type: 'task_update',
            title: notifTitle,
            body: updates.feedback || updates.decline_reason || null,
            reference_id: existing.id,
            reference_type: 'task',
          });
        }
      }

      return new Response(JSON.stringify({ task: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── DELETE ──────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = payload;
      if (!id) throw new Error('Missing task id');

      const { data: existing } = await adminClient.from('tasks')
        .select('created_by, assigned_to')
        .eq('id', id)
        .single();

      if (!existing) {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (existing.created_by !== actor_id && existing.assigned_to !== actor_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await adminClient.from('tasks').delete().eq('id', id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('tasks error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

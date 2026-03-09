import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    // LIST
    if (action === 'list') {
      const { tab } = payload; // 'my_tasks' | 'assigned'
      let query = adminClient.from('tasks').select('*');

      if (tab === 'assigned') {
        query = query.eq('assigned_to', actor_id);
      } else {
        query = query.eq('created_by', actor_id);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ tasks: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CREATE
    if (action === 'create') {
      const { title, description, priority, due_date, assigned_to, team_id } = payload;

      const { data, error } = await adminClient.from('tasks').insert({
        title,
        description: description || null,
        priority: priority || 'medium',
        due_date: due_date || null,
        assigned_to: assigned_to || null,
        team_id: team_id || null,
        created_by: actor_id,
      }).select().single();

      if (error) throw error;

      // Notify assignee
      if (data.assigned_to && data.assigned_to !== actor_id) {
        await adminClient.from('notifications').insert({
          user_id: data.assigned_to,
          type: 'task_assigned',
          title: `You've been assigned a new task: ${data.title}`,
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

    // UPDATE
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) throw new Error('Missing task id');

      // Verify ownership
      const { data: existing } = await adminClient.from('tasks').select('created_by').eq('id', id).single();
      if (!existing || existing.created_by !== actor_id) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If marking done, set completed_at
      if (updates.status === 'done') {
        updates.completed_at = new Date().toISOString();
      } else if (updates.status && updates.status !== 'done') {
        updates.completed_at = null;
      }

      const { data, error } = await adminClient.from('tasks').update(updates).eq('id', id).select().single();
      if (error) throw error;

      // Notify new assignee if assigned_to changed
      if (updates.assigned_to && updates.assigned_to !== actor_id) {
        await adminClient.from('notifications').insert({
          user_id: updates.assigned_to,
          type: 'task_assigned',
          title: `You've been assigned a task: ${data.title}`,
          body: data.description || null,
          reference_id: data.id,
          reference_type: 'task',
        });
      }

      return new Response(JSON.stringify({ task: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE
    if (action === 'delete') {
      const { id } = payload;
      if (!id) throw new Error('Missing task id');

      const { data: existing } = await adminClient.from('tasks').select('created_by').eq('id', id).single();
      if (!existing || existing.created_by !== actor_id) {
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

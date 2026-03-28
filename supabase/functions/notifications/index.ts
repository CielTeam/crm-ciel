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
    const admin = createClient(supabaseUrl, serviceRoleKey);

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
      const { filter = 'all', limit = 50, offset = 0 } = payload;

      let query = admin
        .from('notifications')
        .select('*')
        .eq('user_id', actor_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (filter === 'unread') {
        query = query.eq('is_read', false);
      } else if (filter === 'read') {
        query = query.eq('is_read', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ notifications: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UNREAD COUNT
    if (action === 'unread_count') {
      const { count, error } = await admin
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', actor_id)
        .eq('is_read', false)
        .is('deleted_at', null);

      if (error) throw error;

      return new Response(JSON.stringify({ count: count || 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // MARK READ (single or all)
    if (action === 'mark_read') {
      const { notification_id } = payload;

      let query = admin
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', actor_id)
        .is('deleted_at', null);

      if (notification_id) {
        query = query.eq('id', notification_id);
      } else {
        // Mark all as read
        query = query.eq('is_read', false);
      }

      const { error } = await query;
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
    console.error('notifications error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

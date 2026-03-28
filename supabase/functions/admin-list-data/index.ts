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
    const { actor_id, type } = body;

    if (!actor_id) {
      return new Response(JSON.stringify({ error: 'Missing actor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin
    const { data: isAdmin } = await adminClient.rpc('is_admin', { _user_id: actor_id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (type === 'users') {
      const [profilesRes, rolesRes, teamsRes] = await Promise.all([
        adminClient.from('profiles').select('*'),
        adminClient.from('user_roles').select('*'),
        adminClient.from('teams').select('*'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (teamsRes.error) throw teamsRes.error;

      return new Response(JSON.stringify({
        profiles: profilesRes.data,
        roles: rolesRes.data,
        teams: teamsRes.data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (type === 'teams') {
      const [teamsRes, membersRes, profilesRes] = await Promise.all([
        adminClient.from('teams').select('*').is('deleted_at', null),
        adminClient.from('team_members').select('*'),
        adminClient.from('profiles').select('user_id, display_name').is('deleted_at', null),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (profilesRes.error) throw profilesRes.error;

      return new Response(JSON.stringify({
        teams: teamsRes.data,
        members: membersRes.data,
        profiles: profilesRes.data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown type' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('admin-list-data error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

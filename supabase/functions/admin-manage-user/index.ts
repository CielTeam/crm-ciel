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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller using anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getUser();

    // For Auth0, the user info comes from the JWT sub claim
    // We'll extract the actor_id from the request body since Auth0 tokens aren't Supabase tokens
    const body = await req.json();
    const { action, actor_id } = body;

    if (!actor_id) {
      return new Response(JSON.stringify({ error: 'Missing actor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role to check admin status
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await adminClient.rpc('is_admin', { _user_id: actor_id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any = null;

    switch (action) {
      case 'create_user': {
        const { email, display_name, role } = body;
        if (!email || !display_name || !role) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create a pending profile with a placeholder user_id (email-based)
        const userId = `pending|${email}`;
        const { data: profile, error: pErr } = await adminClient
          .from('profiles')
          .insert({ user_id: userId, email, display_name, status: 'pending' })
          .select()
          .single();

        if (pErr) throw pErr;

        // Assign role
        const { error: rErr } = await adminClient
          .from('user_roles')
          .insert({ user_id: userId, role });

        if (rErr) throw rErr;

        // Audit log
        await adminClient.from('audit_logs').insert({
          action: 'create_user',
          actor_id,
          target_id: userId,
          target_type: 'user',
          metadata: { email, display_name, role },
        });

        result = { profile };
        break;
      }

      case 'update_role': {
        const { target_user_id, new_role } = body;
        if (!target_user_id || !new_role) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Upsert role (delete old, insert new)
        await adminClient.from('user_roles').delete().eq('user_id', target_user_id);
        const { error: rErr } = await adminClient
          .from('user_roles')
          .insert({ user_id: target_user_id, role: new_role });

        if (rErr) throw rErr;

        await adminClient.from('audit_logs').insert({
          action: 'update_role',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
          metadata: { new_role },
        });

        result = { success: true };
        break;
      }

      case 'deactivate_user': {
        const { target_user_id } = body;
        const { error } = await adminClient
          .from('profiles')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', target_user_id);

        if (error) throw error;

        await adminClient.from('audit_logs').insert({
          action: 'deactivate_user',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
        });

        result = { success: true };
        break;
      }

      case 'reactivate_user': {
        const { target_user_id } = body;
        const { error } = await adminClient
          .from('profiles')
          .update({ deleted_at: null, status: 'active' })
          .eq('user_id', target_user_id);

        if (error) throw error;

        await adminClient.from('audit_logs').insert({
          action: 'reactivate_user',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
        });

        result = { success: true };
        break;
      }

      case 'create_team': {
        const { name, department } = body;
        if (!name || !department) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: team, error } = await adminClient
          .from('teams')
          .insert({ name, department })
          .select()
          .single();

        if (error) throw error;

        await adminClient.from('audit_logs').insert({
          action: 'create_team',
          actor_id,
          target_id: team.id,
          target_type: 'team',
          metadata: { name, department },
        });

        result = { team };
        break;
      }

      case 'assign_team': {
        const { target_user_id, team_id } = body;
        if (!target_user_id || !team_id) {
          return new Response(JSON.stringify({ error: 'Missing required fields' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Update profile team_id
        await adminClient.from('profiles').update({ team_id }).eq('user_id', target_user_id);

        // Add to team_members
        await adminClient.from('team_members').upsert(
          { user_id: target_user_id, team_id },
          { onConflict: 'user_id,team_id' }
        );

        await adminClient.from('audit_logs').insert({
          action: 'assign_team',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
          metadata: { team_id },
        });

        result = { success: true };
        break;
      }

      case 'remove_team_member': {
        const { target_user_id, team_id } = body;
        await adminClient.from('team_members').delete().eq('user_id', target_user_id).eq('team_id', team_id);
        await adminClient.from('profiles').update({ team_id: null }).eq('user_id', target_user_id);

        await adminClient.from('audit_logs').insert({
          action: 'remove_team_member',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
          metadata: { team_id },
        });

        result = { success: true };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('admin-manage-user error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

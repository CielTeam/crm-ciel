import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type JsonResponseBody = Record<string, unknown>;

type AdminManageUserAction =
  | 'create_user'
  | 'update_role'
  | 'deactivate_user'
  | 'reactivate_user'
  | 'create_team'
  | 'assign_team'
  | 'remove_team_member';

interface AdminManageUserRequest {
  action?: AdminManageUserAction;
  actor_id?: string;
  email?: string;
  display_name?: string;
  role?: string;
  target_user_id?: string;
  new_role?: string;
  name?: string;
  department?: string;
  team_id?: string;
}

interface CreatedProfile {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  status: string;
}

interface CreatedTeam {
  id: string;
  name: string;
  department: string;
}

function jsonResponse(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Internal server error';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Missing required environment variables' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { error: claimsError } = await anonClient.auth.getUser();
    if (claimsError) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401);
    }

    const body = (await req.json()) as AdminManageUserRequest;
    const { action, actor_id } = body;

    if (!actor_id) {
      return jsonResponse({ error: 'Missing actor_id' }, 400);
    }

    if (!action) {
      return jsonResponse({ error: 'Missing action' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin, error: isAdminError } = await adminClient.rpc('is_admin', {
      _user_id: actor_id,
    });

    if (isAdminError) {
      throw isAdminError;
    }

    if (!isAdmin) {
      return jsonResponse({ error: 'Forbidden: admin role required' }, 403);
    }

    let result: JsonResponseBody | null = null;

    switch (action) {
      case 'create_user': {
        const { email, display_name, role } = body;

        if (!email || !display_name || !role) {
          return jsonResponse({ error: 'Missing required fields' }, 400);
        }

        const { data: existing, error: existingError } = await adminClient
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (existing) {
          return jsonResponse({ error: 'A user with this email already exists' }, 409);
        }

        const userId = `pending|${email}`;

        const { data: profile, error: profileError } = await adminClient
          .from('profiles')
          .insert({
            user_id: userId,
            email,
            display_name,
            status: 'pending',
          })
          .select()
          .single<CreatedProfile>();

        if (profileError) {
          throw profileError;
        }

        const { error: roleError } = await adminClient.from('user_roles').insert({
          user_id: userId,
          role,
        });

        if (roleError) {
          throw roleError;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'create_user',
          actor_id,
          target_id: userId,
          target_type: 'user',
          metadata: { email, display_name, role },
        });

        if (auditError) {
          throw auditError;
        }

        result = { profile };
        break;
      }

      case 'update_role': {
        const { target_user_id, new_role } = body;

        if (!target_user_id || !new_role) {
          return jsonResponse({ error: 'Missing required fields' }, 400);
        }

        const { error: deleteRoleError } = await adminClient
          .from('user_roles')
          .delete()
          .eq('user_id', target_user_id);

        if (deleteRoleError) {
          throw deleteRoleError;
        }

        const { error: insertRoleError } = await adminClient.from('user_roles').insert({
          user_id: target_user_id,
          role: new_role,
        });

        if (insertRoleError) {
          throw insertRoleError;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'update_role',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
          metadata: { new_role },
        });

        if (auditError) {
          throw auditError;
        }

        result = { success: true };
        break;
      }

      case 'deactivate_user': {
        const { target_user_id } = body;

        if (!target_user_id) {
          return jsonResponse({ error: 'Missing target_user_id' }, 400);
        }

        const { error } = await adminClient
          .from('profiles')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', target_user_id);

        if (error) {
          throw error;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'deactivate_user',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
        });

        if (auditError) {
          throw auditError;
        }

        result = { success: true };
        break;
      }

      case 'reactivate_user': {
        const { target_user_id } = body;

        if (!target_user_id) {
          return jsonResponse({ error: 'Missing target_user_id' }, 400);
        }

        const { error } = await adminClient
          .from('profiles')
          .update({ deleted_at: null, status: 'active' })
          .eq('user_id', target_user_id);

        if (error) {
          throw error;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'reactivate_user',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
        });

        if (auditError) {
          throw auditError;
        }

        result = { success: true };
        break;
      }

      case 'create_team': {
        const { name, department } = body;

        if (!name || !department) {
          return jsonResponse({ error: 'Missing required fields' }, 400);
        }

        const { data: team, error } = await adminClient
          .from('teams')
          .insert({ name, department })
          .select()
          .single<CreatedTeam>();

        if (error) {
          throw error;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'create_team',
          actor_id,
          target_id: team.id,
          target_type: 'team',
          metadata: { name, department },
        });

        if (auditError) {
          throw auditError;
        }

        result = { team };
        break;
      }

      case 'assign_team': {
        const { target_user_id, team_id } = body;

        if (!target_user_id || !team_id) {
          return jsonResponse({ error: 'Missing required fields' }, 400);
        }

        const { error: profileUpdateError } = await adminClient
          .from('profiles')
          .update({ team_id })
          .eq('user_id', target_user_id);

        if (profileUpdateError) {
          throw profileUpdateError;
        }

        const { error: upsertError } = await adminClient.from('team_members').upsert(
          { user_id: target_user_id, team_id },
          { onConflict: 'user_id,team_id' },
        );

        if (upsertError) {
          throw upsertError;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'assign_team',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
          metadata: { team_id },
        });

        if (auditError) {
          throw auditError;
        }

        result = { success: true };
        break;
      }

      case 'remove_team_member': {
        const { target_user_id, team_id } = body;

        if (!target_user_id || !team_id) {
          return jsonResponse({ error: 'Missing required fields' }, 400);
        }

        const { error: deleteMemberError } = await adminClient
          .from('team_members')
          .delete()
          .eq('user_id', target_user_id)
          .eq('team_id', team_id);

        if (deleteMemberError) {
          throw deleteMemberError;
        }

        const { error: clearProfileTeamError } = await adminClient
          .from('profiles')
          .update({ team_id: null })
          .eq('user_id', target_user_id);

        if (clearProfileTeamError) {
          throw clearProfileTeamError;
        }

        const { error: auditError } = await adminClient.from('audit_logs').insert({
          action: 'remove_team_member',
          actor_id,
          target_id: target_user_id,
          target_type: 'user',
          metadata: { team_id },
        });

        if (auditError) {
          throw auditError;
        }

        result = { success: true };
        break;
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse(result ?? {});
  } catch (err: unknown) {
    console.error('admin-manage-user error:', err);
    return jsonResponse({ error: getErrorMessage(err) }, 500);
  }
});
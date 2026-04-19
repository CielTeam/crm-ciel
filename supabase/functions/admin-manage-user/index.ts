import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Auth0 JWT Verification ───

interface JwtHeader { alg: string; typ: string; kid: string }
interface JwtPayload { iss: string; sub: string; aud: string | string[]; exp: number; iat: number }
interface JwksKey { kty: string; kid: string; use: string; n: string; e: string; alg: string }
interface JwksResponse { keys: JwksKey[] }

const jwksCache = new Map<string, { keys: JwksKey[]; fetchedAt: number }>();
const JWKS_CACHE_TTL = 600_000;

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T;
}

async function fetchJwks(domain: string): Promise<JwksKey[]> {
  const cached = jwksCache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL) return cached.keys;
  const res = await fetch(`https://${domain}/.well-known/jwks.json`);
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  const data = (await res.json()) as JwksResponse;
  jwksCache.set(domain, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
}

async function importRsaKey(jwk: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifyAuth0Jwt(req: Request): Promise<string> {
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN');
  const auth0Audience = Deno.env.get('AUTH0_AUDIENCE');
  if (!auth0Domain || !auth0Audience) throw new Error('Auth0 configuration missing');
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing token');
  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const header = decodeJwtPart<JwtHeader>(parts[0]);
  if (header.alg !== 'RS256') throw new Error('Unsupported algorithm');
  const keys = await fetchJwks(auth0Domain);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Key not found');
  const key = await importRsaKey(jwk);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('Invalid signature');
  const payload = decodeJwtPart<JwtPayload>(parts[1]);
  if (payload.iss !== `https://${auth0Domain}/`) throw new Error('Invalid issuer');
  const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audArray.includes(auth0Audience)) throw new Error('Invalid audience');
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload.sub;
}

// ─── Rate Limiting ───

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// ─── Helpers ───

function sanitizeString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
}

// ─── Types ───

type JsonResponseBody = Record<string, unknown>;
type AdminManageUserAction =
  | 'create_user' | 'update_role' | 'deactivate_user' | 'reactivate_user'
  | 'create_team' | 'assign_team' | 'remove_team_member'
  | 'update_hierarchy' | 'create_department' | 'update_department' | 'delete_department';

interface AdminManageUserRequest {
  action?: AdminManageUserAction;
  email?: string;
  display_name?: string;
  role?: string;
  target_user_id?: string;
  new_role?: string;
  name?: string;
  department?: string;
  team_id?: string;
  // Hierarchy fields
  id?: string;
  manager_user_id?: string | null;
  department_id?: string | null;
  head_user_id?: string | null;
  parent_department_id?: string | null;
}

interface CreatedProfile { id: string; user_id: string; email: string; display_name: string; status: string }
interface CreatedTeam { id: string; name: string; department: string }

function jsonResponse(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Edge Function ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'admin-manage-user', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Rate limit: 30 requests per 60 seconds
  if (!checkRateLimit(`admin-manage:${actorId}`, 30, 60_000)) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin role from database
    const { data: isAdmin, error: isAdminError } = await adminClient.rpc('is_admin', { _user_id: actorId });
    if (isAdminError) throw isAdminError;
    if (!isAdmin) return jsonResponse({ error: 'Forbidden: admin role required' }, 403);

    const body = (await req.json()) as AdminManageUserRequest;
    const { action } = body;
    if (!action) return jsonResponse({ error: 'Missing action' }, 400);

    let result: JsonResponseBody | null = null;

    switch (action) {
      case 'create_user': {
        const email = sanitizeString(body.email, 255);
        const display_name = sanitizeString(body.display_name, 100);
        const role = sanitizeString(body.role, 50);
        if (!email || !display_name || !role) return jsonResponse({ error: 'Missing required fields' }, 400);

        const { data: existing, error: existingError } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle();
        if (existingError) throw existingError;
        if (existing) return jsonResponse({ error: 'A user with this email already exists' }, 409);

        const userId = `pending|${email}`;
        const { data: profile, error: profileError } = await adminClient.from('profiles').insert({ user_id: userId, email, display_name, status: 'pending' }).select().single<CreatedProfile>();
        if (profileError) throw profileError;

        const { error: roleError } = await adminClient.from('user_roles').insert({ user_id: userId, role });
        if (roleError) throw roleError;

        await adminClient.from('audit_logs').insert({ action: 'create_user', actor_id: actorId, target_id: userId, target_type: 'user', metadata: { email, display_name, role } });
        result = { profile };
        break;
      }

      case 'update_role': {
        const { target_user_id } = body;
        const new_role = sanitizeString(body.new_role, 50);
        if (!target_user_id || !new_role) return jsonResponse({ error: 'Missing required fields' }, 400);
        await adminClient.from('user_roles').delete().eq('user_id', target_user_id);
        const { error: insertRoleError } = await adminClient.from('user_roles').insert({ user_id: target_user_id, role: new_role });
        if (insertRoleError) throw insertRoleError;
        await adminClient.from('audit_logs').insert({ action: 'update_role', actor_id: actorId, target_id: target_user_id, target_type: 'user', metadata: { new_role } });
        result = { success: true };
        break;
      }

      case 'deactivate_user': {
        const { target_user_id } = body;
        if (!target_user_id) return jsonResponse({ error: 'Missing target_user_id' }, 400);
        const { error } = await adminClient.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('user_id', target_user_id);
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'deactivate_user', actor_id: actorId, target_id: target_user_id, target_type: 'user' });
        result = { success: true };
        break;
      }

      case 'reactivate_user': {
        const { target_user_id } = body;
        if (!target_user_id) return jsonResponse({ error: 'Missing target_user_id' }, 400);
        const { error } = await adminClient.from('profiles').update({ deleted_at: null, status: 'active' }).eq('user_id', target_user_id);
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'reactivate_user', actor_id: actorId, target_id: target_user_id, target_type: 'user' });
        result = { success: true };
        break;
      }

      case 'create_team': {
        const name = sanitizeString(body.name, 100);
        const department = sanitizeString(body.department, 100);
        if (!name || !department) return jsonResponse({ error: 'Missing required fields' }, 400);
        const { data: team, error } = await adminClient.from('teams').insert({ name, department }).select().single<CreatedTeam>();
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'create_team', actor_id: actorId, target_id: team.id, target_type: 'team', metadata: { name, department } });
        result = { team };
        break;
      }

      case 'assign_team': {
        const { target_user_id, team_id } = body;
        if (!target_user_id || !team_id) return jsonResponse({ error: 'Missing required fields' }, 400);
        await adminClient.from('profiles').update({ team_id }).eq('user_id', target_user_id);
        await adminClient.from('team_members').upsert({ user_id: target_user_id, team_id }, { onConflict: 'user_id,team_id' });
        await adminClient.from('audit_logs').insert({ action: 'assign_team', actor_id: actorId, target_id: target_user_id, target_type: 'user', metadata: { team_id } });
        result = { success: true };
        break;
      }

      case 'remove_team_member': {
        const { target_user_id, team_id } = body;
        if (!target_user_id || !team_id) return jsonResponse({ error: 'Missing required fields' }, 400);
        await adminClient.from('team_members').delete().eq('user_id', target_user_id).eq('team_id', team_id);
        await adminClient.from('profiles').update({ team_id: null }).eq('user_id', target_user_id);
        await adminClient.from('audit_logs').insert({ action: 'remove_team_member', actor_id: actorId, target_id: target_user_id, target_type: 'user', metadata: { team_id } });
        result = { success: true };
        break;
      }

      case 'update_hierarchy': {
        const { target_user_id } = body;
        if (!target_user_id) return jsonResponse({ error: 'Missing target_user_id' }, 400);
        const updates: Record<string, unknown> = {};
        if (body.manager_user_id !== undefined) updates.manager_user_id = body.manager_user_id;
        if (body.department_id !== undefined) updates.department_id = body.department_id;
        if (Object.keys(updates).length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);
        const { error } = await adminClient.from('profiles').update(updates).eq('user_id', target_user_id);
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'update_hierarchy', actor_id: actorId, target_id: target_user_id, target_type: 'user', metadata: updates });
        result = { success: true };
        break;
      }

      case 'create_department': {
        const name = sanitizeString(body.name, 100);
        if (!name) return jsonResponse({ error: 'Department name required' }, 400);
        const insertPayload: Record<string, unknown> = { name };
        if (body.head_user_id) insertPayload.head_user_id = body.head_user_id;
        if (body.parent_department_id) insertPayload.parent_department_id = body.parent_department_id;
        const { data: dept, error } = await adminClient.from('departments').insert(insertPayload).select().single();
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'create_department', actor_id: actorId, target_id: dept.id, target_type: 'department', metadata: insertPayload });
        result = { department: dept };
        break;
      }

      case 'update_department': {
        const { id } = body;
        if (!id) return jsonResponse({ error: 'Missing department id' }, 400);
        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = sanitizeString(body.name, 100);
        if (body.head_user_id !== undefined) updates.head_user_id = body.head_user_id;
        if (body.parent_department_id !== undefined) {
          if (body.parent_department_id === id) return jsonResponse({ error: 'Department cannot be its own parent' }, 400);
          updates.parent_department_id = body.parent_department_id;
        }
        if (Object.keys(updates).length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);
        const { error } = await adminClient.from('departments').update(updates).eq('id', id);
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'update_department', actor_id: actorId, target_id: id, target_type: 'department', metadata: updates });
        result = { success: true };
        break;
      }

      case 'delete_department': {
        const { id } = body;
        if (!id) return jsonResponse({ error: 'Missing department id' }, 400);
        // Unassign users and re-parent children before delete
        await adminClient.from('profiles').update({ department_id: null }).eq('department_id', id);
        await adminClient.from('departments').update({ parent_department_id: null }).eq('parent_department_id', id);
        const { error } = await adminClient.from('departments').delete().eq('id', id);
        if (error) throw error;
        await adminClient.from('audit_logs').insert({ action: 'delete_department', actor_id: actorId, target_id: id, target_type: 'department' });
        result = { success: true };
        break;
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse(result ?? {});
  } catch (err: unknown) {
    console.error('admin-manage-user error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

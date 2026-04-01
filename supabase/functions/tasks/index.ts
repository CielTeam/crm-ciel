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

type UserRoleRow = { role: string };
type TeamRow = { id: string };
type TeamMemberRow = { user_id: string };
type ProfileRow = { user_id: string; display_name: string; avatar_url: string | null; email?: string };
type TaskActivityLog = { actor_id: string };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LEAD_ROLES = ['chairman', 'vice_president', 'hr', 'head_of_operations', 'team_development_lead', 'technical_lead', 'head_of_accounting', 'head_of_marketing', 'sales_lead'];

async function getActorRoles(client: ReturnType<typeof createClient>, actorId: string): Promise<string[]> {
  const { data } = await client.from('user_roles').select('role').eq('user_id', actorId);
  return (data as UserRoleRow[] | null)?.map(r => r.role) ?? [];
}

async function getActorTeamMemberIds(client: ReturnType<typeof createClient>, actorId: string): Promise<string[]> {
  const { data: teams } = await client.from('teams').select('id').eq('lead_user_id', actorId).is('deleted_at', null);
  if (!teams?.length) return [];
  const teamIds = (teams as TeamRow[]).map(t => t.id);
  const { data: members } = await client.from('team_members').select('user_id').in('team_id', teamIds);
  return (members as TeamMemberRow[] | null)?.map(m => m.user_id).filter(uid => uid !== actorId) ?? [];
}

async function logActivity(client: ReturnType<typeof createClient>, taskId: string, actorId: string, oldStatus: string | null, newStatus: string | null, note?: string | null) {
  await client.from('task_activity_logs').insert({ task_id: taskId, actor_id: actorId, old_status: oldStatus, new_status: newStatus, note: note ?? null });
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Edge Function ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'tasks', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Rate limit: 30 requests per 60 seconds
  if (!checkRateLimit(`tasks:${actorId}`, 30, 60_000)) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { action, ...payload } = body;

    // ─── LIST ───
    if (action === 'list') {
      const { tab = 'my_tasks' } = payload;
      const roles = await getActorRoles(admin, actorId);
      const isLead = roles.some(r => LEAD_ROLES.includes(r));

      let query = admin.from('tasks').select('*');

      if (tab === 'my_tasks') {
        query = query.eq('created_by', actorId);
      } else if (tab === 'assigned') {
        query = query.eq('assigned_to', actorId);
      } else if (tab === 'team_tasks' && isLead) {
        const memberIds = await getActorTeamMemberIds(admin, actorId);
        if (memberIds.length === 0) return jsonResponse({ tasks: [] });
        query = query.or(memberIds.map(id => `assigned_to.eq.${id}`).join(',') + ',' + memberIds.map(id => `created_by.eq.${id}`).join(','));
      } else {
        query = query.or(`created_by.eq.${actorId},assigned_to.eq.${actorId}`);
      }

      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse({ tasks: data || [] });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const { title, description, priority, due_date, assigned_to, estimated_duration } = payload;
      const cleanTitle = sanitizeString(title, 255);
      const cleanDescription = sanitizeString(description, 5000);
      if (!cleanTitle) return jsonResponse({ error: 'Title is required' }, 400);

      const taskType = assigned_to && assigned_to !== actorId ? 'assigned' : 'personal';
      const { data, error } = await admin.from('tasks').insert({
        title: cleanTitle, description: cleanDescription || null, priority: priority || 'medium',
        due_date: due_date || null, assigned_to: assigned_to || null, estimated_duration: estimated_duration || null,
        created_by: actorId, task_type: taskType,
      }).select().single();
      if (error) throw error;

      await logActivity(admin, data.id, actorId, null, 'todo', 'Task created');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.create', target_type: 'task', target_id: data.id, metadata: { title: cleanTitle } });

      if (assigned_to && assigned_to !== actorId) {
        await admin.from('notifications').insert({ user_id: assigned_to, type: 'task_assigned', title: 'New task assigned to you', body: cleanTitle, reference_id: data.id, reference_type: 'task' });
      }
      return jsonResponse({ task: data }, 201);
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);

      const { data: existing } = await admin.from('tasks').select('*').eq('id', id).single();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);

      if (existing.created_by !== actorId && existing.assigned_to !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        if (!roles.some(r => LEAD_ROLES.includes(r))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const oldStatus = existing.status;
      const updatePayload: Record<string, unknown> = {};
      const allowedFields = ['title', 'description', 'priority', 'due_date', 'status', 'challenges', 'estimated_duration', 'actual_duration', 'feedback', 'decline_reason', 'completed_at'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'title') updatePayload[field] = sanitizeString(updates[field], 255);
          else if (field === 'description' || field === 'feedback' || field === 'challenges') updatePayload[field] = sanitizeString(updates[field], 5000);
          else if (field === 'decline_reason') updatePayload[field] = sanitizeString(updates[field], 1000);
          else updatePayload[field] = updates[field];
        }
      }
      if (updatePayload.status === 'done' && !updatePayload.completed_at) updatePayload.completed_at = new Date().toISOString();

      const { data, error } = await admin.from('tasks').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.update', target_type: 'task', target_id: id, metadata: { fields: Object.keys(updatePayload) } });

      if (updatePayload.status && updatePayload.status !== oldStatus) {
        await logActivity(admin, id, actorId, oldStatus, updatePayload.status as string);
        const notifyUserId = existing.created_by === actorId ? existing.assigned_to : existing.created_by;
        if (notifyUserId) {
          await admin.from('notifications').insert({ user_id: notifyUserId, type: 'task_status_changed', title: `Task status changed to ${updatePayload.status}`, body: existing.title, reference_id: id, reference_type: 'task' });
        }
      }
      return jsonResponse({ task: data });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);
      const { data: existing } = await admin.from('tasks').select('created_by, title').eq('id', id).single();
      if (!existing || existing.created_by !== actorId) return jsonResponse({ error: 'Forbidden' }, 403);
      const { error } = await admin.from('tasks').delete().eq('id', id);
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.delete', target_type: 'task', target_id: id, metadata: { title: existing.title } });
      return jsonResponse({ success: true });
    }

    // ─── ASSIGNABLE USERS ───
    if (action === 'assignable_users') {
      const roles = await getActorRoles(admin, actorId);
      const isLead = roles.some(r => LEAD_ROLES.includes(r));
      let userIds: string[] = [];
      if (isLead) userIds = await getActorTeamMemberIds(admin, actorId);
      if (!userIds.includes(actorId)) userIds.push(actorId);

      const { data: profiles } = await admin.from('profiles').select('user_id, display_name, avatar_url, email').in('user_id', userIds).is('deleted_at', null);
      const { data: userRoles } = await admin.from('user_roles').select('user_id, role').in('user_id', userIds);
      const roleMap = new Map((userRoles as { user_id: string; role: string }[] || []).map(r => [r.user_id, r.role]));

      const users = (profiles as ProfileRow[] || []).map(p => ({
        user_id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url, email: p.email || null, role: roleMap.get(p.user_id) || null,
      }));
      return jsonResponse({ users });
    }

    // ─── LIST ACTIVITY ───
    if (action === 'list_activity') {
      const { task_id } = payload;
      if (!task_id) return jsonResponse({ error: 'task_id is required' }, 400);

      const { data: logs, error } = await admin.from('task_activity_logs').select('*').eq('task_id', task_id).order('created_at', { ascending: true });
      if (error) throw error;

      const actorIds = [...new Set((logs || []).map((l: TaskActivityLog) => l.actor_id))];
      const { data: profiles } = await admin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', actorIds);
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
      const cleanContent = sanitizeString(content, 2000);
      if (!task_id || !cleanContent) return jsonResponse({ error: 'task_id and content are required' }, 400);

      const { data: task } = await admin.from('tasks').select('created_by, assigned_to').eq('id', task_id).single();
      if (!task || (task.created_by !== actorId && task.assigned_to !== actorId)) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data, error } = await admin.from('task_comments').insert({ task_id, author_id: actorId, content: cleanContent }).select().single();
      if (error) throw error;

      await logActivity(admin, task_id, actorId, null, null, `Comment: ${cleanContent.substring(0, 100)}`);
      const { data: profile } = await admin.from('profiles').select('display_name, avatar_url').eq('user_id', actorId).single();
      return jsonResponse({ comment: { ...data, author_name: (profile as ProfileRow | null)?.display_name || 'Unknown', author_avatar: (profile as ProfileRow | null)?.avatar_url || null } }, 201);
    }

    // ─── LIST COMMENTS ───
    if (action === 'list_comments') {
      const { task_id } = payload;
      if (!task_id) return jsonResponse({ error: 'task_id is required' }, 400);

      const { data: comments, error } = await admin.from('task_comments').select('*').eq('task_id', task_id).order('created_at', { ascending: true });
      if (error) throw error;

      const authorIds = [...new Set((comments || []).map((c: { author_id: string }) => c.author_id))];
      const { data: profiles } = await admin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', authorIds);
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
      if (!task_id || !new_assigned_to) return jsonResponse({ error: 'task_id and new_assigned_to are required' }, 400);

      const { data: task } = await admin.from('tasks').select('*').eq('id', task_id).single();
      if (!task) return jsonResponse({ error: 'Task not found' }, 404);

      if (task.created_by !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        if (!roles.some(r => LEAD_ROLES.includes(r))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const oldAssignee = task.assigned_to;
      const { data, error } = await admin.from('tasks').update({ assigned_to: new_assigned_to, task_type: new_assigned_to !== task.created_by ? 'assigned' : 'personal' }).eq('id', task_id).select().single();
      if (error) throw error;

      await logActivity(admin, task_id, actorId, null, null, `Reassigned from ${oldAssignee || 'unassigned'} to ${new_assigned_to}`);
      if (new_assigned_to !== actorId) {
        await admin.from('notifications').insert({ user_id: new_assigned_to, type: 'task_assigned', title: 'A task has been reassigned to you', body: task.title, reference_id: task_id, reference_type: 'task' });
      }
      return jsonResponse({ task: data });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('tasks error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

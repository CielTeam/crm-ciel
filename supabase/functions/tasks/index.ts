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
type TaskRecord = {
  id: string; title: string; description: string | null; status: string; priority: string;
  created_by: string; assigned_to: string | null; team_id: string | null; due_date: string | null;
  completed_at: string | null; created_at: string; updated_at: string; task_type: string;
  challenges: string | null; estimated_duration: string | null; actual_duration: string | null;
  feedback: string | null; decline_reason: string | null; pinned: boolean; sort_order: number;
  started_at: string | null; completion_notes: string | null;
  mark_done_by: string | null; mark_done_at: string | null;
  mark_undone_by: string | null; mark_undone_at: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const GLOBAL_ASSIGNER_ROLES = ['chairman', 'vice_president', 'hr', 'head_of_operations'];
const LEAD_ROLES = [...GLOBAL_ASSIGNER_ROLES, 'team_development_lead', 'technical_lead', 'head_of_accounting', 'head_of_marketing', 'sales_lead'];

const ROLE_TO_DEPARTMENT: Record<string, string> = {
  chairman: 'executive', vice_president: 'executive', hr: 'hr',
  head_of_operations: 'operations', operations_employee: 'operations',
  team_development_lead: 'development', developer_employee: 'development',
  technical_lead: 'technical', technical_employee: 'technical',
  head_of_accounting: 'accounting', accounting_employee: 'accounting',
  head_of_marketing: 'marketing', marketing_employee: 'marketing',
  sales_lead: 'sales', sales_employee: 'sales', driver: 'logistics',
};

const DEPARTMENT_TO_ROLES: Record<string, string[]> = {};
for (const [role, dept] of Object.entries(ROLE_TO_DEPARTMENT)) {
  if (!DEPARTMENT_TO_ROLES[dept]) DEPARTMENT_TO_ROLES[dept] = [];
  DEPARTMENT_TO_ROLES[dept].push(role);
}

async function getActorRoles(client: ReturnType<typeof createClient>, actorId: string): Promise<string[]> {
  const { data } = await client.from('user_roles').select('role').eq('user_id', actorId);
  return (data as UserRoleRow[] | null)?.map(r => r.role) ?? [];
}

async function getUserIdsByRoles(client: ReturnType<typeof createClient>, roleList: string[]): Promise<string[]> {
  const { data } = await client.from('user_roles').select('user_id').in('role', roleList);
  return (data as { user_id: string }[] || []).map(r => r.user_id);
}

async function getActorDepartmentMemberIds(client: ReturnType<typeof createClient>, actorId: string, roles: string[]): Promise<string[]> {
  const departments = new Set<string>();
  for (const role of roles) {
    const dept = ROLE_TO_DEPARTMENT[role];
    if (dept) departments.add(dept);
  }
  if (roles.includes('sales_lead')) departments.add('marketing');
  if (departments.size === 0) return [];

  const deptRoles: string[] = [];
  for (const dept of departments) {
    const rolesInDept = DEPARTMENT_TO_ROLES[dept];
    if (rolesInDept) deptRoles.push(...rolesInDept);
  }

  const memberIds = await getUserIdsByRoles(client, deptRoles);

  // Union with team_members for forward compatibility
  const { data: teams } = await client.from('teams').select('id').eq('lead_user_id', actorId).is('deleted_at', null);
  if (teams?.length) {
    const teamIds = (teams as TeamRow[]).map(t => t.id);
    const { data: members } = await client.from('team_members').select('user_id').in('team_id', teamIds);
    if (members) {
      for (const m of members as TeamMemberRow[]) {
        if (!memberIds.includes(m.user_id)) memberIds.push(m.user_id);
      }
    }
  }

  return memberIds.filter(uid => uid !== actorId);
}

async function getExpandedAssignableUsers(client: ReturnType<typeof createClient>, actorId: string, roles: string[]): Promise<string[]> {
  const isGlobal = roles.some(r => GLOBAL_ASSIGNER_ROLES.includes(r));
  if (isGlobal) {
    const { data: allProfiles } = await client.from('profiles').select('user_id').is('deleted_at', null);
    return (allProfiles as { user_id: string }[] || []).map(p => p.user_id);
  }

  const memberIds = await getActorDepartmentMemberIds(client, actorId, roles);
  if (!memberIds.includes(actorId)) memberIds.push(actorId);
  return memberIds;
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
      } else if (tab === 'assigned_by_me') {
        query = query.eq('created_by', actorId).eq('task_type', 'assigned');
      } else if (tab === 'team_tasks' && isLead) {
        const memberIds = await getActorDepartmentMemberIds(admin, actorId, roles);
        if (memberIds.length === 0) return jsonResponse({ tasks: [] });
        // Use separate queries to avoid .or() with special chars in Auth0 IDs
        const { data: assignedData } = await admin.from('tasks').select('*').in('assigned_to', memberIds)
          .order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        const { data: createdData } = await admin.from('tasks').select('*').in('created_by', memberIds)
          .order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        const taskMap = new Map<string, TaskRecord>();
        for (const t of (assignedData || []) as TaskRecord[]) taskMap.set(t.id, t);
        for (const t of (createdData || []) as TaskRecord[]) taskMap.set(t.id, t);
        const merged = [...taskMap.values()].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return jsonResponse({ tasks: merged });
      } else {
        // Use separate queries for safety with special chars in user IDs
        const { data: createdData } = await admin.from('tasks').select('*').eq('created_by', actorId)
          .order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        const { data: assignedData } = await admin.from('tasks').select('*').eq('assigned_to', actorId)
          .order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        const taskMap = new Map<string, TaskRecord>();
        for (const t of (createdData || []) as TaskRecord[]) taskMap.set(t.id, t);
        for (const t of (assignedData || []) as TaskRecord[]) taskMap.set(t.id, t);
        const merged = [...taskMap.values()].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        return jsonResponse({ tasks: merged });
      }

      query = query.order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
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

      // Validate assignment permission
      if (assigned_to && assigned_to !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        const isLead = roles.some(r => LEAD_ROLES.includes(r));
        if (!isLead) return jsonResponse({ error: 'You do not have permission to assign tasks' }, 403);

        const allowedUsers = await getExpandedAssignableUsers(admin, actorId, roles);
        if (!allowedUsers.includes(assigned_to)) {
          return jsonResponse({ error: 'You cannot assign tasks to this user' }, 403);
        }
      }

      const taskType = assigned_to && assigned_to !== actorId ? 'assigned' : 'personal';
      const status = taskType === 'assigned' ? 'pending_accept' : 'todo';
      const { data, error } = await admin.from('tasks').insert({
        title: cleanTitle, description: cleanDescription || null, priority: priority || 'medium',
        due_date: due_date || null, assigned_to: assigned_to || null, estimated_duration: estimated_duration || null,
        created_by: actorId, task_type: taskType, status,
      }).select().single();
      if (error) throw error;

      await logActivity(admin, data.id, actorId, null, status, 'Task created');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.create', target_type: 'task', target_id: data.id, metadata: { title: cleanTitle } });

      if (assigned_to && assigned_to !== actorId) {
        const { data: actorProfile } = await admin.from('profiles').select('display_name').eq('user_id', actorId).single();
        const actorName = (actorProfile as ProfileRow | null)?.display_name || 'Someone';
        await admin.from('notifications').insert({
          user_id: assigned_to, type: 'task_assigned',
          title: `New task assigned by ${actorName}`,
          body: cleanTitle, reference_id: data.id, reference_type: 'task',
        });
      }
      return jsonResponse({ task: data }, 201);
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);

      const { data: existing } = await admin.from('tasks').select('*').eq('id', id).single();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);
      const task = existing as TaskRecord;

      if (task.created_by !== actorId && task.assigned_to !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        if (!roles.some(r => LEAD_ROLES.includes(r))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const oldStatus = task.status;
      const updatePayload: Record<string, unknown> = {};
      const allowedFields = ['title', 'description', 'priority', 'due_date', 'status', 'challenges', 'estimated_duration', 'actual_duration', 'feedback', 'decline_reason', 'completed_at', 'completion_notes', 'pinned', 'sort_order'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'title') updatePayload[field] = sanitizeString(updates[field], 255);
          else if (field === 'description' || field === 'feedback' || field === 'challenges' || field === 'completion_notes') updatePayload[field] = sanitizeString(updates[field], 5000);
          else if (field === 'decline_reason') updatePayload[field] = sanitizeString(updates[field], 1000);
          else updatePayload[field] = updates[field];
        }
      }

      // Auto-timestamps
      if (updatePayload.status === 'in_progress' && !task.started_at) {
        updatePayload.started_at = new Date().toISOString();
      }
      if (updatePayload.status === 'done' || updatePayload.status === 'approved') {
        if (!updatePayload.completed_at) updatePayload.completed_at = new Date().toISOString();
        updatePayload.mark_done_by = actorId;
        updatePayload.mark_done_at = new Date().toISOString();
      }

      const { data, error } = await admin.from('tasks').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.update', target_type: 'task', target_id: id, metadata: { fields: Object.keys(updatePayload) } });

      if (updatePayload.status && updatePayload.status !== oldStatus) {
        await logActivity(admin, id, actorId, oldStatus, updatePayload.status as string);
        const notifyUserId = task.created_by === actorId ? task.assigned_to : task.created_by;
        if (notifyUserId) {
          await admin.from('notifications').insert({ user_id: notifyUserId, type: 'task_status_changed', title: `Task status changed to ${updatePayload.status}`, body: task.title, reference_id: id, reference_type: 'task' });
        }
      }
      return jsonResponse({ task: data });
    }

    // ─── MARK DONE ───
    if (action === 'mark_done') {
      const { id, completion_notes } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);

      const { data: existing } = await admin.from('tasks').select('*').eq('id', id).single();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);
      const task = existing as TaskRecord;

      // Only assignee or creator can mark done
      if (task.created_by !== actorId && task.assigned_to !== actorId) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const now = new Date().toISOString();
      const newStatus = task.task_type === 'personal' ? 'done' : 'approved';
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        completed_at: now,
        mark_done_by: actorId,
        mark_done_at: now,
      };
      if (completion_notes) {
        updatePayload.completion_notes = sanitizeString(completion_notes, 5000);
      }
      if (!task.started_at) {
        updatePayload.started_at = now;
      }

      const { data, error } = await admin.from('tasks').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, task.status, newStatus, 'Marked as done');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.mark_done', target_type: 'task', target_id: id });

      // Notify creator if assignee marked done
      if (task.created_by !== actorId && task.created_by) {
        const { data: actorProfile } = await admin.from('profiles').select('display_name').eq('user_id', actorId).single();
        const actorName = (actorProfile as ProfileRow | null)?.display_name || 'Someone';
        await admin.from('notifications').insert({
          user_id: task.created_by, type: 'task_completed',
          title: `${actorName} completed task: ${task.title}`,
          body: task.title, reference_id: id, reference_type: 'task',
        });
      }
      return jsonResponse({ task: data });
    }

    // ─── MARK UNDONE ───
    if (action === 'mark_undone') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);

      const { data: existing } = await admin.from('tasks').select('*').eq('id', id).single();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);
      const task = existing as TaskRecord;

      if (task.created_by !== actorId && task.assigned_to !== actorId) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const now = new Date().toISOString();
      const newStatus = task.task_type === 'personal' ? 'in_progress' : 'in_progress';
      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        completed_at: null,
        mark_undone_by: actorId,
        mark_undone_at: now,
      };

      const { data, error } = await admin.from('tasks').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, task.status, newStatus, 'Marked as undone');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.mark_undone', target_type: 'task', target_id: id });

      const notifyUserId = task.created_by === actorId ? task.assigned_to : task.created_by;
      if (notifyUserId) {
        await admin.from('notifications').insert({
          user_id: notifyUserId, type: 'task_status_changed',
          title: 'Task was marked as not done',
          body: task.title, reference_id: id, reference_type: 'task',
        });
      }
      return jsonResponse({ task: data });
    }

    // ─── TOGGLE PIN ───
    if (action === 'toggle_pin') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);

      const { data: existing } = await admin.from('tasks').select('*').eq('id', id).single();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);
      const task = existing as TaskRecord;

      // Only creator or lead roles can pin
      if (task.created_by !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        if (!roles.some(r => LEAD_ROLES.includes(r))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const newPinned = !task.pinned;
      const { data, error } = await admin.from('tasks').update({ pinned: newPinned }).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, null, null, newPinned ? 'Pinned task' : 'Unpinned task');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: newPinned ? 'task.pin' : 'task.unpin', target_type: 'task', target_id: id });
      return jsonResponse({ task: data });
    }

    // ─── REORDER ───
    if (action === 'reorder') {
      const { task_ids } = payload;
      if (!Array.isArray(task_ids)) return jsonResponse({ error: 'task_ids array is required' }, 400);

      for (let i = 0; i < task_ids.length; i++) {
        await admin.from('tasks').update({ sort_order: i }).eq('id', task_ids[i]);
      }

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.reorder', target_type: 'task', metadata: { count: task_ids.length } });
      return jsonResponse({ success: true });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'Task id is required' }, 400);
      const { data: existing } = await admin.from('tasks').select('created_by, title').eq('id', id).single();
      if (!existing || (existing as { created_by: string }).created_by !== actorId) return jsonResponse({ error: 'Forbidden' }, 403);
      const { error } = await admin.from('tasks').delete().eq('id', id);
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.delete', target_type: 'task', target_id: id, metadata: { title: (existing as { title: string }).title } });
      return jsonResponse({ success: true });
    }

    // ─── ASSIGNABLE USERS ───
    if (action === 'assignable_users') {
      const roles = await getActorRoles(admin, actorId);
      const isLead = roles.some(r => LEAD_ROLES.includes(r));
      let userIds: string[] = [];
      if (isLead) {
        userIds = await getExpandedAssignableUsers(admin, actorId, roles);
      }
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
      if (!task || ((task as TaskRecord).created_by !== actorId && (task as TaskRecord).assigned_to !== actorId)) return jsonResponse({ error: 'Forbidden' }, 403);

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
      const taskData = task as TaskRecord;

      if (taskData.created_by !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        if (!roles.some(r => LEAD_ROLES.includes(r))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      // Validate target user is in scope
      const roles = await getActorRoles(admin, actorId);
      const allowedUsers = await getExpandedAssignableUsers(admin, actorId, roles);
      if (!allowedUsers.includes(new_assigned_to)) {
        return jsonResponse({ error: 'You cannot assign tasks to this user' }, 403);
      }

      const oldAssignee = taskData.assigned_to;
      const { data, error } = await admin.from('tasks').update({ assigned_to: new_assigned_to, task_type: new_assigned_to !== taskData.created_by ? 'assigned' : 'personal' }).eq('id', task_id).select().single();
      if (error) throw error;

      await logActivity(admin, task_id, actorId, null, null, `Reassigned from ${oldAssignee || 'unassigned'} to ${new_assigned_to}`);
      if (new_assigned_to !== actorId) {
        await admin.from('notifications').insert({ user_id: new_assigned_to, type: 'task_assigned', title: 'A task has been reassigned to you', body: taskData.title, reference_id: task_id, reference_type: 'task' });
      }
      return jsonResponse({ task: data });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (typeof err === 'object' && err !== null && 'message' in err)
        ? String((err as Record<string, unknown>).message)
        : JSON.stringify(err);
    console.error('tasks error:', message, err);
    return jsonResponse({ error: `Server error: ${message}` }, 500);
  }
});

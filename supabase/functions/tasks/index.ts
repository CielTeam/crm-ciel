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

// Grant project access to a user (idempotent)
async function grantProjectAccess(admin: ReturnType<typeof createClient>, projectId: string | null | undefined, userId: string | null | undefined, addedBy: string) {
  if (!projectId || !userId) return;
  try {
    await admin.from('project_members')
      .upsert({ project_id: projectId, user_id: userId, added_by: addedBy }, { onConflict: 'project_id,user_id' });
  } catch { /* best effort */ }
}

// Enrich a list of tasks with their assignees (multi-assignee support)
type AssigneeOut = { user_id: string; display_name: string | null; avatar_url: string | null; is_primary: boolean };
async function enrichTasksWithAssignees(admin: ReturnType<typeof createClient>, tasks: TaskRecord[]): Promise<(TaskRecord & { assignees: AssigneeOut[] })[]> {
  if (!tasks.length) return [];
  const taskIds = tasks.map(t => t.id);
  const { data: extras } = await admin.from('task_assignees').select('task_id, user_id').in('task_id', taskIds);
  const extraRows = (extras as { task_id: string; user_id: string }[] | null) || [];
  const allUserIds = new Set<string>();
  for (const t of tasks) if (t.assigned_to) allUserIds.add(t.assigned_to);
  for (const r of extraRows) allUserIds.add(r.user_id);
  let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (allUserIds.size) {
    const { data: profs } = await admin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', [...allUserIds]);
    profileMap = new Map(((profs as ProfileRow[] | null) || []).map(p => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]));
  }
  const byTask = new Map<string, AssigneeOut[]>();
  for (const t of tasks) {
    const list: AssigneeOut[] = [];
    if (t.assigned_to) {
      const p = profileMap.get(t.assigned_to);
      list.push({ user_id: t.assigned_to, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null, is_primary: true });
    }
    byTask.set(t.id, list);
  }
  for (const r of extraRows) {
    const list = byTask.get(r.task_id) || [];
    if (list.some(a => a.user_id === r.user_id)) continue;
    const p = profileMap.get(r.user_id);
    list.push({ user_id: r.user_id, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null, is_primary: false });
    byTask.set(r.task_id, list);
  }
  return tasks.map(t => ({ ...t, assignees: byTask.get(t.id) || [] }));
}

// Notify a list of users (insert + broadcast)
async function notifyUsers(admin: ReturnType<typeof createClient>, userIds: string[], notification: { type: string; title: string; body?: string | null; reference_id?: string | null; reference_type?: string | null }) {
  for (const uid of userIds) {
    try {
      await admin.from('notifications').insert({ user_id: uid, ...notification });
      await broadcastNotification(admin, uid, notification);
    } catch { /* best effort */ }
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function broadcastNotification(admin: ReturnType<typeof createClient>, userId: string, notification: { type: string; title: string; body?: string | null; reference_id?: string | null; reference_type?: string | null; id?: string }) {
  try {
    const channel = admin.channel(`user-notify-${userId}`);
    await channel.send({ type: 'broadcast', event: 'new_notification', payload: notification });
    await admin.removeChannel(channel);
  } catch { /* best effort */ }
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

      // Helper to fetch tasks where the actor is in task_assignees (extra tab participation)
      const fetchExtraAssigneeTasks = async (): Promise<TaskRecord[]> => {
        const { data: rows } = await admin.from('task_assignees').select('task_id').eq('user_id', actorId);
        const ids = ((rows as { task_id: string }[] | null) || []).map(r => r.task_id);
        if (!ids.length) return [];
        const { data: ts } = await admin.from('tasks').select('*').in('id', ids);
        return (ts as TaskRecord[] | null) || [];
      };

      const sortMerged = (tasks: TaskRecord[]): TaskRecord[] => {
        const map = new Map<string, TaskRecord>();
        for (const t of tasks) map.set(t.id, t);
        return [...map.values()].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      };

      let merged: TaskRecord[] = [];

      if (tab === 'my_tasks') {
        const { data } = await admin.from('tasks').select('*').eq('created_by', actorId)
          .order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        merged = sortMerged((data as TaskRecord[]) || []);
      } else if (tab === 'assigned') {
        const { data: primary } = await admin.from('tasks').select('*').eq('assigned_to', actorId);
        const extras = await fetchExtraAssigneeTasks();
        merged = sortMerged([...((primary as TaskRecord[]) || []), ...extras]);
      } else if (tab === 'assigned_by_me') {
        const { data } = await admin.from('tasks').select('*').eq('created_by', actorId).eq('task_type', 'assigned');
        merged = sortMerged((data as TaskRecord[]) || []);
      } else if (tab === 'team_tasks' && isLead) {
        const memberIds = await getActorDepartmentMemberIds(admin, actorId, roles);
        if (memberIds.length === 0) return jsonResponse({ tasks: [] });
        const { data: assignedData } = await admin.from('tasks').select('*').in('assigned_to', memberIds);
        const { data: createdData } = await admin.from('tasks').select('*').in('created_by', memberIds);
        merged = sortMerged([...((assignedData as TaskRecord[]) || []), ...((createdData as TaskRecord[]) || [])]);
      } else {
        const { data: createdData } = await admin.from('tasks').select('*').eq('created_by', actorId);
        const { data: assignedData } = await admin.from('tasks').select('*').eq('assigned_to', actorId);
        const extras = await fetchExtraAssigneeTasks();
        merged = sortMerged([...((createdData as TaskRecord[]) || []), ...((assignedData as TaskRecord[]) || []), ...extras]);
      }

      const enriched = await enrichTasksWithAssignees(admin, merged);
      return jsonResponse({ tasks: enriched });
    }

    // ─── LIST MANAGEMENT (paginated, hierarchy-scoped) ───
    if (action === 'list_management') {
      const page = Math.max(1, parseInt(String(payload.page ?? 1), 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(payload.page_size ?? 25), 10)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const roles = await getActorRoles(admin, actorId);
      const isExecOrAdmin = roles.some(r => ['chairman','vice_president','head_of_operations','technical_lead','team_development_lead'].includes(r));
      if (!isExecOrAdmin) return jsonResponse({ error: 'Forbidden' }, 403);

      // Resolve visible user ids via hierarchy helper
      const { data: vis } = await admin.rpc('get_visible_user_ids', { _user_id: actorId });
      const visibleIds = new Set(((vis as { uid: string }[] | null) || []).map(r => r.uid));

      let q = admin.from('tasks').select('*', { count: 'exact' });
      if (Array.isArray(payload.status) && payload.status.length) q = q.in('status', payload.status);
      if (Array.isArray(payload.priority) && payload.priority.length) q = q.in('priority', payload.priority);
      if (payload.account_id) q = q.eq('account_id', payload.account_id);
      if (payload.user_id) q = q.eq('assigned_to', payload.user_id);
      if (payload.date_from) q = q.gte('created_at', payload.date_from);
      if (payload.date_to) q = q.lte('created_at', payload.date_to);
      if (payload.search && typeof payload.search === 'string') {
        const s = payload.search.replace(/[%_]/g, '\\$&').substring(0, 100);
        q = q.ilike('title', `%${s}%`);
      }
      if (payload.department_id) {
        const { data: deptMembers } = await admin.from('profiles').select('user_id').eq('department_id', payload.department_id);
        const ids = ((deptMembers as { user_id: string }[] | null) || []).map(p => p.user_id);
        if (!ids.length) return jsonResponse({ tasks: [], total: 0, page, page_size: pageSize });
        q = q.in('assigned_to', ids);
      }
      q = q.order('updated_at', { ascending: false }).range(from, to);
      const { data, error, count } = await q;
      if (error) throw error;

      let tasks = (data || []) as TaskRecord[];
      // RBAC filter unless full-company exec
      const isFullScope = roles.some(r => ['chairman'].includes(r));
      if (!isFullScope) {
        tasks = tasks.filter(t => visibleIds.has(t.created_by) || (!!t.assigned_to && visibleIds.has(t.assigned_to)));
      }
      return jsonResponse({ tasks, total: count ?? tasks.length, page, page_size: pageSize });
    }

    // ─── LIST BY LEAD ───
    if (action === 'list_by_lead') {
      const { lead_id } = payload;
      if (!lead_id) return jsonResponse({ error: 'lead_id required' }, 400);
      const { data, error } = await admin.from('tasks').select('*').eq('lead_id', lead_id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const { data: vis } = await admin.rpc('get_visible_user_ids', { _user_id: actorId });
      const visibleIds = new Set(((vis as { uid: string }[] | null) || []).map(r => r.uid));
      visibleIds.add(actorId);
      const tasks = (data || []) as TaskRecord[];
      const filtered = tasks.filter(t => visibleIds.has(t.created_by) || (!!t.assigned_to && visibleIds.has(t.assigned_to)));
      return jsonResponse({ tasks: filtered });
    }

    // ─── LIST BY ACCOUNT ───
    if (action === 'list_by_account') {
      const { account_id } = payload;
      if (!account_id) return jsonResponse({ error: 'account_id required' }, 400);
      const { data, error } = await admin.from('tasks').select('*').eq('account_id', account_id)
        .order('pinned', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      const { data: vis } = await admin.rpc('get_visible_user_ids', { _user_id: actorId });
      const visibleIds = new Set(((vis as { uid: string }[] | null) || []).map(r => r.uid));
      visibleIds.add(actorId);
      const tasks = (data || []) as TaskRecord[];
      const filtered = tasks.filter(t => visibleIds.has(t.created_by) || (!!t.assigned_to && visibleIds.has(t.assigned_to)));
      return jsonResponse({ tasks: filtered });
    }

    // ─── ATTACH TO PROJECT ───
    if (action === 'attach_to_project') {
      const { task_id, project_id, create_personal_project_name } = payload;
      if (!task_id) return jsonResponse({ error: 'task_id required' }, 400);
      const { data: existing } = await admin.from('tasks').select('*').eq('id', task_id).single();
      if (!existing) return jsonResponse({ error: 'Task not found' }, 404);
      const task = existing as TaskRecord;
      if (task.created_by !== actorId && task.assigned_to !== actorId) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }

      let finalProjectId: string | null = project_id ?? null;
      let projectName: string | null = null;

      if (create_personal_project_name && typeof create_personal_project_name === 'string') {
        const cleanName = sanitizeString(create_personal_project_name, 200);
        if (!cleanName) return jsonResponse({ error: 'Project name required' }, 400);
        const { data: newProj, error: pErr } = await admin.from('projects').insert({
          name: cleanName, is_personal: true, owner_user_id: actorId, created_by: actorId,
        }).select().single();
        if (pErr) throw pErr;
        finalProjectId = newProj.id;
        projectName = cleanName;
      } else if (finalProjectId) {
        const { data: proj } = await admin.from('projects').select('id, name, owner_user_id, is_personal, department').eq('id', finalProjectId).maybeSingle();
        if (!proj) return jsonResponse({ error: 'Project not found' }, 404);
        projectName = (proj as { name: string }).name;
      }

      const { data: updated, error } = await admin.from('tasks').update({ project_id: finalProjectId }).eq('id', task_id).select().single();
      if (error) throw error;

      await logActivity(admin, task_id, actorId, null, null, finalProjectId ? `Moved to project: ${projectName}` : 'Removed from project');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.attach_to_project', target_type: 'task', target_id: task_id, metadata: { project_id: finalProjectId } });
      return jsonResponse({ task: updated });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const { title, description, priority, due_date, assigned_to, estimated_duration, account_id, ticket_id, lead_id, visible_scope, progress_percent, project_id } = payload;
      const cleanTitle = sanitizeString(title, 255);
      const cleanDescription = sanitizeString(description, 5000);
      if (!cleanTitle) return jsonResponse({ error: 'Title is required' }, 400);

      if (assigned_to && assigned_to !== actorId) {
        const roles = await getActorRoles(admin, actorId);
        const isLead = roles.some(r => LEAD_ROLES.includes(r));
        if (!isLead) return jsonResponse({ error: 'You do not have permission to assign tasks' }, 403);

        const allowedUsers = await getExpandedAssignableUsers(admin, actorId, roles);
        if (!allowedUsers.includes(assigned_to)) {
          return jsonResponse({ error: 'You cannot assign tasks to this user' }, 403);
        }
      }

      if (ticket_id) {
        const { data: ticket } = await admin.from('tickets').select('id').eq('id', ticket_id).maybeSingle();
        if (!ticket) return jsonResponse({ error: 'Linked ticket not found' }, 422);
      }

      let linkedLeadCompany: string | null = null;
      if (lead_id) {
        const { data: lead } = await admin.from('leads').select('id, company_name').eq('id', lead_id).is('deleted_at', null).maybeSingle();
        if (!lead) return jsonResponse({ error: 'Linked lead not found' }, 422);
        linkedLeadCompany = (lead as { company_name: string }).company_name;
      }

      const allowedScope = ['private','department','management_chain'];
      const scope = allowedScope.includes(visible_scope) ? visible_scope : 'private';
      const progress = Math.max(0, Math.min(100, parseInt(String(progress_percent ?? 0), 10) || 0));

      const taskType = assigned_to && assigned_to !== actorId ? 'assigned' : 'personal';
      const status = taskType === 'assigned' ? 'pending_accept' : 'todo';

      // Validate project_id (optional). Origin from lead/account skips project requirement.
      let finalProjectId: string | null = project_id || null;
      if (finalProjectId) {
        const { data: proj } = await admin.from('projects').select('id').eq('id', finalProjectId).is('deleted_at', null).maybeSingle();
        if (!proj) return jsonResponse({ error: 'Linked project not found' }, 422);
      }

      const { data, error } = await admin.from('tasks').insert({
        title: cleanTitle, description: cleanDescription || null, priority: priority || 'medium',
        due_date: due_date || null, assigned_to: assigned_to || null, estimated_duration: estimated_duration || null,
        created_by: actorId, task_type: taskType, status,
        account_id: account_id || null, ticket_id: ticket_id || null, lead_id: lead_id || null,
        visible_scope: scope, progress_percent: progress, project_id: finalProjectId,
      }).select().single();
      if (error) throw error;

      await logActivity(admin, data.id, actorId, null, status, 'Task created');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.create', target_type: 'task', target_id: data.id, metadata: { title: cleanTitle, lead_id: lead_id || null } });

      if (lead_id) {
        await admin.from('lead_activities').insert({
          lead_id, actor_id: actorId, activity_type: 'task_created',
          title: `Task created: ${cleanTitle}`,
          metadata: { task_id: data.id, assigned_to: assigned_to || null },
        });
      }

      if (assigned_to && assigned_to !== actorId) {
        const { data: actorProfile } = await admin.from('profiles').select('display_name').eq('user_id', actorId).single();
        const actorName = (actorProfile as ProfileRow | null)?.display_name || 'Someone';
        const titleSuffix = linkedLeadCompany ? ` (from lead: ${linkedLeadCompany})` : '';
        const notif = {
          type: 'task_assigned',
          title: `New task assigned by ${actorName}${titleSuffix}`,
          body: cleanTitle, reference_id: data.id, reference_type: 'task',
        };
        await admin.from('notifications').insert({ user_id: assigned_to, ...notif });
        await broadcastNotification(admin, assigned_to, notif);
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
      const VALID_STATUSES = ['todo', 'in_progress', 'done', 'pending_accept', 'accepted', 'declined', 'submitted', 'approved', 'rejected'];
      const allowedFields = ['title', 'description', 'priority', 'due_date', 'status', 'challenges', 'estimated_duration', 'actual_duration', 'feedback', 'decline_reason', 'completed_at', 'completion_notes', 'pinned', 'sort_order', 'account_id', 'ticket_id', 'lead_id', 'progress_percent', 'visible_scope', 'project_id', 'project_sort_order'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'status' && !VALID_STATUSES.includes(updates[field])) {
            return jsonResponse({ error: `Invalid status: ${updates[field]}. Allowed: ${VALID_STATUSES.join(', ')}` }, 400);
          }
          if (field === 'progress_percent') {
            const p = parseInt(String(updates[field]), 10);
            if (isNaN(p) || p < 0 || p > 100) return jsonResponse({ error: 'progress_percent must be 0-100' }, 400);
            updatePayload[field] = p;
          } else if (field === 'visible_scope') {
            if (!['private','department','management_chain'].includes(updates[field])) {
              return jsonResponse({ error: 'Invalid visible_scope' }, 400);
            }
            updatePayload[field] = updates[field];
          } else if (field === 'title') updatePayload[field] = sanitizeString(updates[field], 255);
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
          const notif = { type: 'task_status_changed', title: `Task status changed to ${updatePayload.status}`, body: task.title, reference_id: id, reference_type: 'task' };
          await admin.from('notifications').insert({ user_id: notifyUserId, ...notif });
          await broadcastNotification(admin, notifyUserId, notif);
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
        const notif = {
          type: 'task_completed',
          title: `${actorName} completed task: ${task.title}`,
          body: task.title, reference_id: id, reference_type: 'task',
        };
        await admin.from('notifications').insert({ user_id: task.created_by, ...notif });
        await broadcastNotification(admin, task.created_by, notif);
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
        const notif = { type: 'task_status_changed', title: 'Task was marked as not done', body: task.title, reference_id: id, reference_type: 'task' };
        await admin.from('notifications').insert({ user_id: notifyUserId, ...notif });
        await broadcastNotification(admin, notifyUserId, notif);
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
        const notif = { type: 'task_assigned', title: 'A task has been reassigned to you', body: taskData.title, reference_id: task_id, reference_type: 'task' };
        await admin.from('notifications').insert({ user_id: new_assigned_to, ...notif });
        await broadcastNotification(admin, new_assigned_to, notif);
      }
      return jsonResponse({ task: data });
    }

    // ─── CREATE FROM TICKET ───
    if (action === 'create_from_ticket') {
      const { ticket_id, title, description, assigned_to, priority, due_date } = payload;
      if (!ticket_id) return jsonResponse({ error: 'ticket_id is required' }, 400);
      const { data: ticket } = await admin.from('tickets').select('*').eq('id', ticket_id).maybeSingle();
      if (!ticket) return jsonResponse({ error: 'Ticket not found' }, 404);
      const t = ticket as { id: string; title: string; account_id: string | null };

      const cleanTitle = sanitizeString(title || `Follow-up: ${t.title}`, 255);
      const cleanDesc = sanitizeString(description, 5000);
      const taskType = assigned_to && assigned_to !== actorId ? 'assigned' : 'personal';
      const status = taskType === 'assigned' ? 'pending_accept' : 'todo';

      const { data, error } = await admin.from('tasks').insert({
        title: cleanTitle, description: cleanDesc || null,
        priority: priority || 'medium', due_date: due_date || null,
        assigned_to: assigned_to || actorId, created_by: actorId,
        task_type: taskType, status,
        account_id: t.account_id, ticket_id: t.id, visible_scope: 'department',
      }).select().single();
      if (error) throw error;

      await logActivity(admin, (data as { id: string }).id, actorId, null, status, `Task created from ticket ${ticket_id}`);
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'task.create_from_ticket', target_type: 'task', target_id: (data as { id: string }).id, metadata: { ticket_id } });
      await admin.from('ticket_activities').insert({ ticket_id, actor_id: actorId, activity_type: 'task_created', title: 'Linked task created', changes: {}, metadata: { task_id: (data as { id: string }).id } });
      return jsonResponse({ task: data }, 201);
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

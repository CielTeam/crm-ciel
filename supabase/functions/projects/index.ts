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
function decodeJwtPart<T>(part: string): T { return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T; }
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

function sanitizeString(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXEC_ROLES = ['chairman', 'vice_president', 'head_of_operations', 'technical_lead', 'team_development_lead'];
const LEAD_ROLES = [...EXEC_ROLES, 'head_of_accounting', 'head_of_marketing', 'sales_lead', 'hr'];

const ROLE_TO_DEPARTMENT: Record<string, string> = {
  chairman: 'executive', vice_president: 'executive', hr: 'hr',
  head_of_operations: 'operations', operations_employee: 'operations',
  team_development_lead: 'development', developer_employee: 'development',
  technical_lead: 'technical', technical_employee: 'technical',
  head_of_accounting: 'accounting', accounting_employee: 'accounting',
  head_of_marketing: 'marketing', marketing_employee: 'marketing',
  sales_lead: 'sales', sales_employee: 'sales', driver: 'logistics',
};

type ProjectRow = {
  id: string; name: string; description: string | null; status: string; color: string | null;
  department: string | null; is_personal: boolean; target_end_date: string | null;
  owner_user_id: string; created_by: string; created_at: string; updated_at: string; deleted_at: string | null;
};
type TaskRow = {
  id: string; title: string; status: string; priority: string; due_date: string | null;
  estimated_duration: string | null; project_id: string | null; project_sort_order: number;
  assigned_to: string | null; created_by: string; created_at: string; updated_at: string;
  completed_at: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function getActorRoles(client: ReturnType<typeof createClient>, actorId: string): Promise<string[]> {
  const { data } = await client.from('user_roles').select('role').eq('user_id', actorId);
  return ((data as { role: string }[] | null) ?? []).map(r => r.role);
}

async function getActorDepartments(client: ReturnType<typeof createClient>, actorId: string, roles: string[]): Promise<string[]> {
  const depts = new Set<string>();
  for (const role of roles) {
    const dept = ROLE_TO_DEPARTMENT[role];
    if (dept) depts.add(dept);
  }
  // Profile department (canonical)
  const { data: prof } = await client.from('profiles').select('department_id').eq('user_id', actorId).maybeSingle();
  const deptId = (prof as { department_id: string | null } | null)?.department_id;
  if (deptId) {
    const { data: d } = await client.from('departments').select('name').eq('id', deptId).maybeSingle();
    const name = (d as { name: string } | null)?.name;
    if (name) depts.add(name);
  }
  return [...depts];
}

async function canSeeProject(client: ReturnType<typeof createClient>, actorId: string, project: ProjectRow, actorRoles: string[], actorDepts: string[]): Promise<boolean> {
  if (project.owner_user_id === actorId) return true;
  if (project.is_personal) return false;
  if (actorRoles.some(r => EXEC_ROLES.includes(r))) return true;
  if (project.department && actorDepts.includes(project.department)) return true;
  const { data: shared } = await client.from('project_departments').select('department').eq('project_id', project.id);
  const sharedDepts = ((shared as { department: string }[] | null) ?? []).map(s => s.department);
  return sharedDepts.some(d => actorDepts.includes(d));
}

function computeAnalytics(tasks: TaskRow[], targetEndDate: string | null) {
  const total = tasks.length;
  const open = tasks.filter(t => ['todo','pending_accept','accepted'].includes(t.status)).length;
  const inProgress = tasks.filter(t => ['in_progress','submitted'].includes(t.status)).length;
  const done = tasks.filter(t => ['done','approved'].includes(t.status)).length;
  const now = Date.now();
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date).getTime() < now && !['done','approved'].includes(t.status)).length;
  const completion = total === 0 ? 0 : Math.round((done / total) * 100);

  // Sum remaining estimated duration (parses "Xh Ym" format)
  let remainingMinutes = 0;
  for (const t of tasks) {
    if (['done','approved'].includes(t.status)) continue;
    if (!t.estimated_duration) continue;
    const hMatch = t.estimated_duration.match(/(\d+)\s*h/);
    const mMatch = t.estimated_duration.match(/(\d+)\s*m/);
    remainingMinutes += (hMatch ? parseInt(hMatch[1], 10) * 60 : 0) + (mMatch ? parseInt(mMatch[1], 10) : 0);
  }

  let daysRemaining: number | null = null;
  let onTrack: boolean | null = null;
  if (targetEndDate) {
    const target = new Date(targetEndDate).getTime();
    daysRemaining = Math.ceil((target - now) / 86400000);
    if (open + inProgress > 0) {
      onTrack = daysRemaining > 0 && remainingMinutes / 60 <= daysRemaining * 8;
    } else {
      onTrack = true;
    }
  }

  return { total, open, in_progress: inProgress, done, overdue, completion_percent: completion, remaining_minutes: remainingMinutes, days_remaining: daysRemaining, on_track: onTrack };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!checkRateLimit(`projects:${actorId}`, 60, 60_000)) return jsonResponse({ error: 'Too many requests' }, 429);

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { action, ...payload } = body;

    const roles = await getActorRoles(admin, actorId);
    const isExec = roles.some(r => EXEC_ROLES.includes(r));
    const isLead = roles.some(r => LEAD_ROLES.includes(r));
    const actorDepts = await getActorDepartments(admin, actorId, roles);

    // ─── LIST ───
    if (action === 'list') {
      const { scope = 'mine', department } = payload;
      let query = admin.from('projects').select('*').is('deleted_at', null);

      if (scope === 'all') {
        if (!isExec) return jsonResponse({ error: 'Forbidden' }, 403);
        if (department) query = query.eq('department', department);
      } else if (scope === 'department') {
        // Department + cross-department (excluding personals)
        const { data: depRows } = await admin.from('project_departments').select('project_id').in('department', actorDepts);
        const sharedIds = ((depRows as { project_id: string }[] | null) ?? []).map(r => r.project_id);
        const { data: directRows } = await admin.from('projects').select('id').in('department', actorDepts).is('deleted_at', null);
        const directIds = ((directRows as { id: string }[] | null) ?? []).map(r => r.id);
        const allIds = [...new Set([...sharedIds, ...directIds])];
        if (allIds.length === 0) return jsonResponse({ projects: [] });
        const { data, error } = await admin.from('projects').select('*').in('id', allIds).is('deleted_at', null).order('created_at', { ascending: false });
        if (error) throw error;
        return jsonResponse({ projects: data || [] });
      } else {
        // mine: owned + personal + accessible department projects
        const { data: owned } = await admin.from('projects').select('*').eq('owner_user_id', actorId).is('deleted_at', null);
        const { data: depRows } = await admin.from('project_departments').select('project_id').in('department', actorDepts.length ? actorDepts : ['__none__']);
        const sharedIds = ((depRows as { project_id: string }[] | null) ?? []).map(r => r.project_id);
        const { data: deptDirect } = await admin.from('projects').select('*').in('department', actorDepts.length ? actorDepts : ['__none__']).eq('is_personal', false).is('deleted_at', null);
        const { data: shared } = sharedIds.length
          ? await admin.from('projects').select('*').in('id', sharedIds).eq('is_personal', false).is('deleted_at', null)
          : { data: [] as ProjectRow[] };

        const map = new Map<string, ProjectRow>();
        for (const p of [...(owned || []), ...(deptDirect || []), ...(shared || [])] as ProjectRow[]) {
          map.set(p.id, p);
        }
        const list = [...map.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return jsonResponse({ projects: list });
      }

      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse({ projects: data || [] });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const { name, description, department, is_personal, color, target_end_date, shared_departments } = payload;
      const cleanName = sanitizeString(name, 200);
      if (!cleanName) return jsonResponse({ error: 'Name is required' }, 400);

      const personal = !!is_personal;
      let dept = department || null;

      if (!personal) {
        if (!isLead) return jsonResponse({ error: 'Only department leads or executives can create department projects' }, 403);
        if (!dept) return jsonResponse({ error: 'Department is required for non-personal projects' }, 400);
        if (!isExec && !actorDepts.includes(dept)) {
          return jsonResponse({ error: 'You can only create projects in your own department' }, 403);
        }
      } else {
        dept = null;
      }

      const { data, error } = await admin.from('projects').insert({
        name: cleanName,
        description: sanitizeString(description, 2000) || null,
        department: dept,
        is_personal: personal,
        color: typeof color === 'string' ? color.substring(0, 16) : null,
        target_end_date: target_end_date || null,
        owner_user_id: actorId,
        created_by: actorId,
      }).select().single();
      if (error) throw error;

      // Shared departments
      if (!personal && Array.isArray(shared_departments) && shared_departments.length) {
        const rows = shared_departments
          .filter((d: unknown): d is string => typeof d === 'string' && d !== dept)
          .map((d: string) => ({ project_id: data.id, department: d }));
        if (rows.length) await admin.from('project_departments').insert(rows);
      }

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'project.create', target_type: 'project', target_id: data.id, metadata: { name: cleanName, department: dept, is_personal: personal } });
      return jsonResponse({ project: data }, 201);
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      const { data: existing } = await admin.from('projects').select('*').eq('id', id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Project not found' }, 404);
      const project = existing as ProjectRow;

      const canEdit = project.owner_user_id === actorId || isExec || (project.department && actorDepts.includes(project.department) && isLead);
      if (!canEdit) return jsonResponse({ error: 'Forbidden' }, 403);

      const allowed = ['name', 'description', 'status', 'color', 'target_end_date'];
      const upd: Record<string, unknown> = {};
      for (const f of allowed) {
        if (updates[f] !== undefined) {
          if (f === 'name') upd[f] = sanitizeString(updates[f], 200);
          else if (f === 'description') upd[f] = sanitizeString(updates[f], 2000) || null;
          else if (f === 'status') {
            if (!['active','on_hold','completed','archived'].includes(updates[f])) return jsonResponse({ error: 'Invalid status' }, 400);
            upd[f] = updates[f];
          } else upd[f] = updates[f];
        }
      }

      const { data, error } = await admin.from('projects').update(upd).eq('id', id).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'project.update', target_type: 'project', target_id: id, metadata: { fields: Object.keys(upd) } });
      return jsonResponse({ project: data });
    }

    // ─── ARCHIVE / RESTORE ───
    if (action === 'archive' || action === 'restore') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      const { data: existing } = await admin.from('projects').select('*').eq('id', id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Project not found' }, 404);
      const project = existing as ProjectRow;
      const canEdit = project.owner_user_id === actorId || isExec;
      if (!canEdit) return jsonResponse({ error: 'Forbidden' }, 403);
      const { error } = await admin.from('projects').update({ deleted_at: action === 'archive' ? new Date().toISOString() : null }).eq('id', id);
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: `project.${action}`, target_type: 'project', target_id: id });
      return jsonResponse({ success: true });
    }

    // ─── ANALYTICS (single project) ───
    if (action === 'analytics') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      const { data: project } = await admin.from('projects').select('*').eq('id', id).maybeSingle();
      if (!project) return jsonResponse({ error: 'Project not found' }, 404);
      const canSee = await canSeeProject(admin, actorId, project as ProjectRow, roles, actorDepts);
      if (!canSee) return jsonResponse({ error: 'Forbidden' }, 403);
      const { data: tasks } = await admin.from('tasks').select('id, title, status, priority, due_date, estimated_duration, project_id, project_sort_order, assigned_to, created_by, created_at, updated_at, completed_at').eq('project_id', id);
      const stats = computeAnalytics((tasks as TaskRow[]) || [], (project as ProjectRow).target_end_date);
      return jsonResponse({ project, analytics: stats });
    }

    // ─── ANALYTICS SUMMARY (per-project rollup for caller's projects) ───
    if (action === 'analytics_summary') {
      const { department, scope = 'mine' } = payload;
      let projects: ProjectRow[] = [];

      if (scope === 'all' && isExec) {
        let q = admin.from('projects').select('*').is('deleted_at', null);
        if (department) q = q.eq('department', department);
        const { data } = await q;
        projects = (data as ProjectRow[]) || [];
      } else {
        // accessible projects
        const { data: owned } = await admin.from('projects').select('*').eq('owner_user_id', actorId).is('deleted_at', null);
        const { data: depDirect } = actorDepts.length
          ? await admin.from('projects').select('*').in('department', actorDepts).eq('is_personal', false).is('deleted_at', null)
          : { data: [] as ProjectRow[] };
        const { data: depRows } = actorDepts.length
          ? await admin.from('project_departments').select('project_id').in('department', actorDepts)
          : { data: [] };
        const sharedIds = ((depRows as { project_id: string }[] | null) ?? []).map(r => r.project_id);
        const { data: shared } = sharedIds.length
          ? await admin.from('projects').select('*').in('id', sharedIds).eq('is_personal', false).is('deleted_at', null)
          : { data: [] as ProjectRow[] };
        const map = new Map<string, ProjectRow>();
        for (const p of [...(owned || []), ...(depDirect || []), ...(shared || [])] as ProjectRow[]) map.set(p.id, p);
        if (department) {
          for (const [k, v] of map) if (v.department !== department) map.delete(k);
        }
        projects = [...map.values()];
      }

      const ids = projects.map(p => p.id);
      const { data: tasksRaw } = ids.length
        ? await admin.from('tasks').select('id, title, status, priority, due_date, estimated_duration, project_id, project_sort_order, assigned_to, created_by, created_at, updated_at, completed_at').in('project_id', ids)
        : { data: [] as TaskRow[] };
      const tasksByProject = new Map<string, TaskRow[]>();
      for (const t of (tasksRaw as TaskRow[]) || []) {
        if (!t.project_id) continue;
        const arr = tasksByProject.get(t.project_id) || [];
        arr.push(t);
        tasksByProject.set(t.project_id, arr);
      }

      const summary = projects.map(p => ({
        project: p,
        analytics: computeAnalytics(tasksByProject.get(p.id) || [], p.target_end_date),
      }));
      return jsonResponse({ summary });
    }

    // ─── REORDER TASKS WITHIN PROJECT ───
    if (action === 'reorder_tasks') {
      const { project_id, task_ids } = payload;
      if (!project_id || !Array.isArray(task_ids)) return jsonResponse({ error: 'project_id and task_ids required' }, 400);
      const { data: project } = await admin.from('projects').select('*').eq('id', project_id).maybeSingle();
      if (!project) return jsonResponse({ error: 'Project not found' }, 404);
      const canSee = await canSeeProject(admin, actorId, project as ProjectRow, roles, actorDepts);
      if (!canSee) return jsonResponse({ error: 'Forbidden' }, 403);
      for (let i = 0; i < task_ids.length; i++) {
        await admin.from('tasks').update({ project_sort_order: i }).eq('id', task_ids[i]).eq('project_id', project_id);
      }
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'project.reorder_tasks', target_type: 'project', target_id: project_id, metadata: { count: task_ids.length } });
      return jsonResponse({ success: true });
    }

    // ─── TASKS BY PROJECT ───
    if (action === 'tasks') {
      const { project_id } = payload;
      if (!project_id) return jsonResponse({ error: 'project_id is required' }, 400);
      const { data: project } = await admin.from('projects').select('*').eq('id', project_id).maybeSingle();
      if (!project) return jsonResponse({ error: 'Project not found' }, 404);
      const canSee = await canSeeProject(admin, actorId, project as ProjectRow, roles, actorDepts);
      if (!canSee) return jsonResponse({ error: 'Forbidden' }, 403);
      const { data, error } = await admin.from('tasks').select('*').eq('project_id', project_id)
        .order('project_sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ tasks: data || [] });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
  }
});

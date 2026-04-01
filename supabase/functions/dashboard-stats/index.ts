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

// ─── Edge Function ───

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXECUTIVE_ROLES = ['chairman', 'vice_president'];
const LEAD_ROLES = ['head_of_operations', 'team_development_lead', 'technical_lead', 'head_of_accounting', 'head_of_marketing', 'sales_lead'];

function getTier(roles: string[]): string {
  for (const r of roles) {
    if (EXECUTIVE_ROLES.includes(r)) return 'executive';
    if (r === 'hr') return 'hr';
    if (LEAD_ROLES.includes(r)) return 'lead';
    if (r === 'driver') return 'driver';
  }
  return 'employee';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'dashboard-stats', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Rate limit: 30 requests per 60 seconds
  if (!checkRateLimit(`dash:${actorId}`, 30, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: userRoles } = await sb.from('user_roles').select('role').eq('user_id', actorId);
    const roles = (userRoles || []).map((r: { role: string }) => r.role);
    const tier = getTier(roles);

    const { data: profile } = await sb.from('profiles').select('team_id').eq('user_id', actorId).single();
    const teamId = profile?.team_id;

    const { data: myTasks } = await sb.from('tasks').select('id, status, priority, title, due_date, assigned_to, created_by').or(`created_by.eq.${actorId},assigned_to.eq.${actorId}`);
    const openTasks = (myTasks || []).filter(t => t.status !== 'done').length;

    const { data: myLeaves } = await sb.from('leaves').select('id, status, leave_type').eq('user_id', actorId).is('deleted_at', null);
    const pendingLeaves = (myLeaves || []).filter(l => l.status === 'pending').length;

    const { data: unreadNotifs } = await sb.from('notifications').select('id').eq('user_id', actorId).eq('is_read', false).is('deleted_at', null);
    const unreadCount = (unreadNotifs || []).length;

    const recentTasks = (myTasks || [])
      .sort((a: { due_date: string | null }, b: { due_date: string | null }) => (b.due_date || '').localeCompare(a.due_date || ''))
      .slice(0, 5);

    const base = { openTasks, pendingLeaves, unreadMessages: unreadCount, recentTasks, tier };

    if (tier === 'employee') {
      return new Response(JSON.stringify(base), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tier === 'driver') {
      const driverTasks = (myTasks || []).filter(t => t.assigned_to === actorId);
      const inProgress = driverTasks.filter(t => t.status === 'in_progress').length;
      const today = new Date().toISOString().split('T')[0];
      const completedToday = driverTasks.filter(t => t.status === 'done' && t.due_date?.startsWith(today)).length;
      return new Response(JSON.stringify({ ...base, assignedTasks: driverTasks.length, inProgress, completedToday, driverTasks: driverTasks.slice(0, 10) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: allProfiles } = await sb.from('profiles').select('user_id, display_name, team_id, status, avatar_url').is('deleted_at', null).eq('status', 'active');
    const { data: allTeams } = await sb.from('teams').select('id, name, department, lead_user_id').is('deleted_at', null);
    const { data: allTeamMembers } = await sb.from('team_members').select('user_id, team_id');
    const { data: allTasks } = await sb.from('tasks').select('id, status, priority, assigned_to, created_by, team_id, due_date, title');
    const { data: allLeaves } = await sb.from('leaves').select('id, status, leave_type, user_id, start_date, end_date').is('deleted_at', null);

    const now = new Date();

    if (tier === 'lead') {
      const teamMemberIds = (allTeamMembers || []).filter(m => m.team_id === teamId).map(m => m.user_id);
      const teamTasks = (allTasks || []).filter(t => teamMemberIds.includes(t.assigned_to || '') || teamMemberIds.includes(t.created_by));
      const teamOpenTasks = teamTasks.filter(t => t.status !== 'done').length;
      const teamOverdue = teamTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length;
      const teamLeaves = (allLeaves || []).filter(l => teamMemberIds.includes(l.user_id));
      const teamPendingLeaves = teamLeaves.filter(l => l.status === 'pending').length;

      const teamWorkload = teamMemberIds.map(uid => {
        const p = (allProfiles || []).find(pr => pr.user_id === uid);
        const taskCount = teamTasks.filter(t => t.assigned_to === uid && t.status !== 'done').length;
        return { userId: uid, displayName: p?.display_name || 'Unknown', avatarUrl: p?.avatar_url, openTasks: taskCount };
      });

      return new Response(JSON.stringify({ ...base, teamSize: teamMemberIds.length, teamOpenTasks, teamOverdue, teamPendingLeaves, teamWorkload, pendingApprovals: teamLeaves.filter(l => l.status === 'pending').slice(0, 5) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tier === 'hr') {
      const totalEmployees = (allProfiles || []).length;
      const allPendingLeaves = (allLeaves || []).filter(l => l.status === 'pending');
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const approvedThisMonth = (allLeaves || []).filter(l => l.status === 'approved' && l.start_date?.startsWith(thisMonth)).length;
      const leaveByType: Record<string, number> = {};
      for (const l of allLeaves || []) leaveByType[l.leave_type] = (leaveByType[l.leave_type] || 0) + 1;
      const todayStr = now.toISOString().split('T')[0];
      const onLeaveToday = (allLeaves || []).filter(l => l.status === 'approved' && l.start_date <= todayStr && l.end_date >= todayStr).length;

      return new Response(JSON.stringify({
        ...base, totalEmployees, orgPendingLeaves: allPendingLeaves.length, approvedThisMonth, onLeaveToday, leaveByType,
        pendingLeaveList: allPendingLeaves.slice(0, 8).map(l => { const p = (allProfiles || []).find(pr => pr.user_id === l.user_id); return { ...l, displayName: p?.display_name || 'Unknown' }; }),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Executive
    const totalEmployees = (allProfiles || []).length;
    const orgOpenTasks = (allTasks || []).filter(t => t.status !== 'done').length;
    const orgPendingLeaves = (allLeaves || []).filter(l => l.status === 'pending').length;
    const orgOverdueCritical = (allTasks || []).filter(t => t.status !== 'done' && t.priority === 'critical' && t.due_date && new Date(t.due_date) < now).length;

    const departments = (allTeams || []).map(team => {
      const memberIds = (allTeamMembers || []).filter(m => m.team_id === team.id).map(m => m.user_id);
      const deptTasks = (allTasks || []).filter(t => memberIds.includes(t.assigned_to || '') || memberIds.includes(t.created_by));
      const deptLeaves = (allLeaves || []).filter(l => memberIds.includes(l.user_id));
      return { id: team.id, name: team.name, department: team.department, memberCount: memberIds.length, openTasks: deptTasks.filter(t => t.status !== 'done').length, overdueTasks: deptTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length, pendingLeaves: deptLeaves.filter(l => l.status === 'pending').length };
    });

    const escalations = (allTasks || []).filter(t => t.status !== 'done' && t.priority === 'critical' && t.due_date && new Date(t.due_date) < now).slice(0, 5).map(t => {
      const p = (allProfiles || []).find(pr => pr.user_id === (t.assigned_to || t.created_by));
      return { ...t, assigneeName: p?.display_name || 'Unassigned' };
    });

    return new Response(JSON.stringify({ ...base, totalEmployees, totalDepartments: (allTeams || []).length, orgOpenTasks, orgPendingLeaves, orgOverdueCritical, departments, escalations }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('dashboard-stats error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

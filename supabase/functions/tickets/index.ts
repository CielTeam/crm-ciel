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
function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Domain constants
const TICKET_TYPES = ['support','incident','service_request','maintenance','deployment','bug_fix','other'] as const;
const TICKET_STATUSES = ['open','in_progress','waiting','resolved','closed','archived'] as const;
const TICKET_PRIORITIES = ['low','medium','high','urgent'] as const;
const TICKET_SOURCES = ['internal','client','email','phone','whatsapp','portal','other'] as const;
const ADMIN_ROLES = ['technical_lead','team_development_lead'];
const EXEC_ROLES = ['chairman','vice_president','head_of_operations'];

// State machine
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress','waiting','resolved','closed','archived'],
  in_progress: ['waiting','resolved','closed','archived'],
  waiting: ['in_progress','resolved','closed','archived'],
  resolved: ['in_progress','closed','archived'],
  closed: ['in_progress','archived'],
  archived: [], // admin-only un-archive handled separately
};

type TicketRow = {
  id: string; title: string; description: string | null;
  ticket_type: string; status: string; priority: string; source_channel: string;
  account_id: string | null; contact_id: string | null;
  created_by: string; assigned_to: string | null; technical_owner_id: string | null;
  support_duration_estimate_hours: number | null; support_duration_actual_hours: number | null;
  resolution_summary: string | null; opened_at: string; closed_at: string | null;
  created_at: string; updated_at: string;
};

async function getActorRoles(admin: ReturnType<typeof createClient>, actorId: string): Promise<string[]> {
  const { data } = await admin.from('user_roles').select('role').eq('user_id', actorId);
  return ((data as { role: string }[] | null) || []).map(r => r.role);
}

async function userHasTicketAccess(admin: ReturnType<typeof createClient>, ticket: TicketRow, actorId: string, roles: string[]): Promise<boolean> {
  if (ticket.created_by === actorId || ticket.assigned_to === actorId || ticket.technical_owner_id === actorId) return true;
  if (roles.some(r => [...ADMIN_ROLES, ...EXEC_ROLES].includes(r))) return true;
  // Hierarchy via DB function
  const { data } = await admin.rpc('get_visible_user_ids', { _user_id: actorId });
  const visible = new Set(((data as { uid: string }[] | null) || []).map(r => r.uid));
  return visible.has(ticket.created_by) ||
         (!!ticket.assigned_to && visible.has(ticket.assigned_to)) ||
         (!!ticket.technical_owner_id && visible.has(ticket.technical_owner_id));
}

async function logTicketActivity(
  admin: ReturnType<typeof createClient>,
  ticketId: string, actorId: string, activityType: string, title: string,
  changes: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}
) {
  await admin.from('ticket_activities').insert({
    ticket_id: ticketId, actor_id: actorId, activity_type: activityType, title, changes, metadata,
  });
}

async function broadcastNotification(admin: ReturnType<typeof createClient>, userId: string, notification: Record<string, unknown>) {
  try {
    const channel = admin.channel(`user-notify-${userId}`);
    await channel.send({ type: 'broadcast', event: 'new_notification', payload: notification });
    await admin.removeChannel(channel);
  } catch { /* best effort */ }
}

function redactComment(c: Record<string, unknown>): Record<string, unknown> {
  if (!c.is_redacted) return c;
  return {
    ...c,
    content: '[Comment removed]',
    _original_redacted: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch (err) {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'tickets', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!checkRateLimit(`tickets:${actorId}`, 60, 60_000)) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { action, ...payload } = body;
    const roles = await getActorRoles(admin, actorId);
    const isExecOrAdmin = roles.some(r => [...ADMIN_ROLES, ...EXEC_ROLES].includes(r));

    // ─── LIST (server-side paginated + filtered + RBAC) ───
    if (action === 'list') {
      const page = Math.max(1, parseInt(String(payload.page ?? 1), 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(String(payload.page_size ?? 25), 10)));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = admin.from('tickets').select('*', { count: 'exact' });

      if (Array.isArray(payload.status) && payload.status.length) query = query.in('status', payload.status);
      if (Array.isArray(payload.ticket_type) && payload.ticket_type.length) query = query.in('ticket_type', payload.ticket_type);
      if (Array.isArray(payload.priority) && payload.priority.length) query = query.in('priority', payload.priority);
      if (Array.isArray(payload.source_channel) && payload.source_channel.length) query = query.in('source_channel', payload.source_channel);
      if (payload.account_id) query = query.eq('account_id', payload.account_id);
      if (payload.assigned_to) query = query.eq('assigned_to', payload.assigned_to);
      if (payload.technical_owner_id) query = query.eq('technical_owner_id', payload.technical_owner_id);
      if (payload.date_from) query = query.gte('opened_at', payload.date_from);
      if (payload.date_to) query = query.lte('opened_at', payload.date_to);
      if (payload.search && typeof payload.search === 'string') {
        const s = payload.search.replace(/[%_]/g, '\\$&').substring(0, 100);
        query = query.ilike('title', `%${s}%`);
      }
      // Default exclude archived unless explicitly requested
      if (!Array.isArray(payload.status) || !payload.status.length) {
        query = query.neq('status', 'archived');
      }

      query = query.order('updated_at', { ascending: false }).range(from, to);
      const { data, error, count } = await query;
      if (error) throw error;

      let tickets = (data || []) as TicketRow[];
      // Apply RBAC filter in memory (cheap; page size capped at 100)
      if (!isExecOrAdmin) {
        const { data: visData } = await admin.rpc('get_visible_user_ids', { _user_id: actorId });
        const visible = new Set(((visData as { uid: string }[] | null) || []).map(r => r.uid));
        tickets = tickets.filter(t =>
          t.created_by === actorId || t.assigned_to === actorId || t.technical_owner_id === actorId ||
          visible.has(t.created_by) ||
          (!!t.assigned_to && visible.has(t.assigned_to)) ||
          (!!t.technical_owner_id && visible.has(t.technical_owner_id))
        );
      }
      return jsonResponse({ tickets, total: count ?? tickets.length, page, page_size: pageSize });
    }

    // ─── GET ───
    if (action === 'get') {
      const { id } = payload;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      const { data, error } = await admin.from('tickets').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = data as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);
      return jsonResponse({ ticket });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const title = sanitizeString(payload.title, 255);
      const description = sanitizeString(payload.description, 5000);
      if (!title) return jsonResponse({ error: 'Title is required' }, 400);
      const ticket_type = TICKET_TYPES.includes(payload.ticket_type) ? payload.ticket_type : 'support';
      const priority = TICKET_PRIORITIES.includes(payload.priority) ? payload.priority : 'medium';
      const source_channel = TICKET_SOURCES.includes(payload.source_channel) ? payload.source_channel : 'internal';
      const account_id = payload.account_id || null;
      const contact_id = payload.contact_id || null;

      // Contact ↔ account integrity
      if (contact_id && account_id) {
        const { data: contact } = await admin.from('contacts').select('account_id').eq('id', contact_id).maybeSingle();
        if (!contact) return jsonResponse({ error: 'Contact not found' }, 422);
        if ((contact as { account_id: string | null }).account_id !== account_id) {
          return jsonResponse({ error: 'Contact does not belong to selected account' }, 422);
        }
      }

      const insertPayload = {
        title, description: description || null,
        ticket_type, priority, source_channel,
        status: 'open',
        account_id, contact_id,
        created_by: actorId,
        assigned_to: payload.assigned_to || null,
        technical_owner_id: payload.technical_owner_id || null,
        support_duration_estimate_hours: payload.support_duration_estimate_hours ?? null,
      };
      const { data, error } = await admin.from('tickets').insert(insertPayload).select().single();
      if (error) throw error;
      const t = data as TicketRow;

      await logTicketActivity(admin, t.id, actorId, 'created', 'Ticket created', { ticket_type, priority });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.create', target_type: 'ticket', target_id: t.id, metadata: { title, ticket_type } });

      // Notify assignee & technical owner if different from creator
      const notifyTargets = [t.assigned_to, t.technical_owner_id].filter((u): u is string => !!u && u !== actorId);
      for (const uid of notifyTargets) {
        const notif = { type: 'ticket_assigned', title: `New ticket assigned: ${t.title}`, body: t.title, reference_id: t.id, reference_type: 'ticket' };
        await admin.from('notifications').insert({ user_id: uid, ...notif });
        await broadcastNotification(admin, uid, notif);
      }
      return jsonResponse({ ticket: t }, 201);
    }

    // ─── UPDATE (general fields, no status changes here) ───
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) return jsonResponse({ error: 'id is required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      const updatePayload: Record<string, unknown> = {};
      if (updates.title !== undefined) updatePayload.title = sanitizeString(updates.title, 255);
      if (updates.description !== undefined) updatePayload.description = sanitizeString(updates.description, 5000) || null;
      if (updates.priority !== undefined && TICKET_PRIORITIES.includes(updates.priority)) updatePayload.priority = updates.priority;
      if (updates.ticket_type !== undefined && TICKET_TYPES.includes(updates.ticket_type)) updatePayload.ticket_type = updates.ticket_type;
      if (updates.source_channel !== undefined && TICKET_SOURCES.includes(updates.source_channel)) updatePayload.source_channel = updates.source_channel;
      if (updates.support_duration_estimate_hours !== undefined) updatePayload.support_duration_estimate_hours = updates.support_duration_estimate_hours;
      if (updates.support_duration_actual_hours !== undefined) updatePayload.support_duration_actual_hours = updates.support_duration_actual_hours;
      if (updates.resolution_summary !== undefined) updatePayload.resolution_summary = sanitizeString(updates.resolution_summary, 5000) || null;

      // contact ↔ account guard if either changes
      const newAccount = updates.account_id !== undefined ? updates.account_id : ticket.account_id;
      const newContact = updates.contact_id !== undefined ? updates.contact_id : ticket.contact_id;
      if (newContact && newAccount) {
        const { data: contact } = await admin.from('contacts').select('account_id').eq('id', newContact).maybeSingle();
        if (!contact) return jsonResponse({ error: 'Contact not found' }, 422);
        if ((contact as { account_id: string | null }).account_id !== newAccount) {
          return jsonResponse({ error: 'Contact does not belong to selected account' }, 422);
        }
      }
      if (updates.account_id !== undefined) updatePayload.account_id = updates.account_id || null;
      if (updates.contact_id !== undefined) updatePayload.contact_id = updates.contact_id || null;

      const { data, error } = await admin.from('tickets').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      await logTicketActivity(admin, id, actorId, 'updated', 'Ticket updated', { fields: Object.keys(updatePayload) });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.update', target_type: 'ticket', target_id: id, metadata: { fields: Object.keys(updatePayload) } });
      return jsonResponse({ ticket: data });
    }

    // ─── CHANGE STATUS (state machine) ───
    if (action === 'change_status') {
      const { id, status: newStatus, resolution_summary } = payload;
      if (!id || !newStatus) return jsonResponse({ error: 'id and status required' }, 400);
      if (!TICKET_STATUSES.includes(newStatus)) return jsonResponse({ error: 'Invalid status' }, 400);

      const { data: existing } = await admin.from('tickets').select('*').eq('id', id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      // Reopen check (resolved/closed → in_progress)
      const isReopen = (ticket.status === 'resolved' || ticket.status === 'closed') && newStatus === 'in_progress';
      if (isReopen) {
        const canReopen = ticket.assigned_to === actorId || ticket.technical_owner_id === actorId || isExecOrAdmin;
        if (!canReopen) return jsonResponse({ error: 'Only assignee, technical owner, or admin can reopen' }, 403);
      }

      // Un-archive admin-only
      if (ticket.status === 'archived' && newStatus !== 'archived') {
        if (!roles.some(r => ADMIN_ROLES.includes(r))) {
          return jsonResponse({ error: 'Only admins can un-archive' }, 403);
        }
      } else {
        const allowed = ALLOWED_TRANSITIONS[ticket.status] || [];
        if (!allowed.includes(newStatus)) {
          return jsonResponse({ error: `Cannot transition from ${ticket.status} to ${newStatus}` }, 422);
        }
      }

      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'closed' || newStatus === 'resolved') {
        if (!ticket.closed_at && newStatus === 'closed') updatePayload.closed_at = new Date().toISOString();
        if (resolution_summary) updatePayload.resolution_summary = sanitizeString(resolution_summary, 5000);
      }
      if (isReopen) updatePayload.closed_at = null;

      const { data, error } = await admin.from('tickets').update(updatePayload).eq('id', id).select().single();
      if (error) throw error;

      await logTicketActivity(admin, id, actorId, 'status_changed', `Status changed: ${ticket.status} → ${newStatus}`, { from: ticket.status, to: newStatus });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.status_change', target_type: 'ticket', target_id: id, metadata: { from: ticket.status, to: newStatus } });

      // Notify other stakeholders
      const targets = [ticket.created_by, ticket.assigned_to, ticket.technical_owner_id]
        .filter((u): u is string => !!u && u !== actorId);
      const uniqueTargets = [...new Set(targets)];
      for (const uid of uniqueTargets) {
        const notif = { type: 'ticket_status', title: `Ticket status: ${newStatus}`, body: ticket.title, reference_id: id, reference_type: 'ticket' };
        await admin.from('notifications').insert({ user_id: uid, ...notif });
        await broadcastNotification(admin, uid, notif);
      }
      return jsonResponse({ ticket: data });
    }

    // ─── ASSIGN ───
    if (action === 'assign') {
      const { id, assigned_to } = payload;
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data, error } = await admin.from('tickets').update({ assigned_to: assigned_to || null }).eq('id', id).select().single();
      if (error) throw error;
      await logTicketActivity(admin, id, actorId, 'assigned', `Assigned to ${assigned_to || 'unassigned'}`, { from: ticket.assigned_to, to: assigned_to });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.assign', target_type: 'ticket', target_id: id, metadata: { from: ticket.assigned_to, to: assigned_to } });
      if (assigned_to && assigned_to !== actorId) {
        const notif = { type: 'ticket_assigned', title: `Ticket assigned to you: ${ticket.title}`, body: ticket.title, reference_id: id, reference_type: 'ticket' };
        await admin.from('notifications').insert({ user_id: assigned_to, ...notif });
        await broadcastNotification(admin, assigned_to, notif);
      }
      return jsonResponse({ ticket: data });
    }

    // ─── SET TECHNICAL OWNER ───
    if (action === 'set_technical_owner') {
      const { id, technical_owner_id } = payload;
      if (!id) return jsonResponse({ error: 'id required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data, error } = await admin.from('tickets').update({ technical_owner_id: technical_owner_id || null }).eq('id', id).select().single();
      if (error) throw error;
      await logTicketActivity(admin, id, actorId, 'tech_owner_changed', `Technical owner set`, { from: ticket.technical_owner_id, to: technical_owner_id });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.set_tech_owner', target_type: 'ticket', target_id: id });
      return jsonResponse({ ticket: data });
    }

    // ─── ADD COMMENT ───
    if (action === 'add_comment') {
      const { ticket_id, content } = payload;
      const cleanContent = sanitizeString(content, 5000);
      if (!ticket_id || !cleanContent) return jsonResponse({ error: 'ticket_id and content required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', ticket_id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data, error } = await admin.from('ticket_comments').insert({
        ticket_id, author_id: actorId, content: cleanContent,
      }).select().single();
      if (error) throw error;

      await logTicketActivity(admin, ticket_id, actorId, 'comment_added', 'Comment added', {}, { comment_id: (data as { id: string }).id });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.comment.add', target_type: 'ticket', target_id: ticket_id, metadata: { comment_id: (data as { id: string }).id } });

      const { data: profile } = await admin.from('profiles').select('display_name, avatar_url').eq('user_id', actorId).maybeSingle();
      const p = profile as { display_name: string | null; avatar_url: string | null } | null;
      return jsonResponse({ comment: { ...data, author_name: p?.display_name || 'Unknown', author_avatar: p?.avatar_url || null } }, 201);
    }

    // ─── LIST COMMENTS (redacted placeholder) ───
    if (action === 'list_comments') {
      const { ticket_id } = payload;
      if (!ticket_id) return jsonResponse({ error: 'ticket_id required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', ticket_id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data: comments, error } = await admin.from('ticket_comments').select('id, ticket_id, author_id, content, is_redacted, redacted_by, redacted_at, redaction_reason, created_at, updated_at').eq('ticket_id', ticket_id).order('created_at', { ascending: true });
      if (error) throw error;

      const ids = [...new Set(((comments || []) as { author_id: string; redacted_by: string | null }[]).flatMap(c => [c.author_id, c.redacted_by].filter((x): x is string => !!x)))];
      const { data: profiles } = await admin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids);
      const pMap = new Map(((profiles as { user_id: string; display_name: string | null; avatar_url: string | null }[] | null) || []).map(p => [p.user_id, p]));

      const enriched = (comments || []).map((c: Record<string, unknown>) => {
        const safe = redactComment(c);
        const author = pMap.get(c.author_id as string);
        const redactor = c.redacted_by ? pMap.get(c.redacted_by as string) : null;
        return {
          ...safe,
          author_name: author?.display_name || 'Unknown',
          author_avatar: author?.avatar_url || null,
          redactor_name: redactor?.display_name || null,
        };
      });
      return jsonResponse({ comments: enriched });
    }

    // ─── REDACT COMMENT ───
    if (action === 'redact_comment') {
      const { comment_id, reason } = payload;
      if (!comment_id) return jsonResponse({ error: 'comment_id required' }, 400);
      const { data: comment } = await admin.from('ticket_comments').select('*').eq('id', comment_id).maybeSingle();
      if (!comment) return jsonResponse({ error: 'Not found' }, 404);
      const c = comment as { id: string; ticket_id: string; author_id: string; is_redacted: boolean };

      const isAuthor = c.author_id === actorId;
      const isAdmin = roles.some(r => ADMIN_ROLES.includes(r));
      if (!isAuthor && !isAdmin) return jsonResponse({ error: 'Only author or admin can redact' }, 403);
      if (c.is_redacted) return jsonResponse({ error: 'Already redacted' }, 422);

      const cleanReason = sanitizeString(reason, 500) || null;
      const { error } = await admin.from('ticket_comments').update({
        is_redacted: true, redacted_by: actorId, redacted_at: new Date().toISOString(), redaction_reason: cleanReason,
      }).eq('id', comment_id);
      if (error) throw error;

      await logTicketActivity(admin, c.ticket_id, actorId, 'comment_redacted', 'Comment removed', {}, { comment_id, reason: cleanReason });
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'ticket.comment.redact', target_type: 'ticket', target_id: c.ticket_id, metadata: { comment_id, reason: cleanReason } });
      return jsonResponse({ success: true });
    }

    // ─── LIST ACTIVITY ───
    if (action === 'list_activity') {
      const { ticket_id } = payload;
      if (!ticket_id) return jsonResponse({ error: 'ticket_id required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', ticket_id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);

      const { data: activity, error } = await admin.from('ticket_activities').select('*').eq('ticket_id', ticket_id).order('created_at', { ascending: true });
      if (error) throw error;
      const ids = [...new Set(((activity as { actor_id: string }[] | null) || []).map(a => a.actor_id))];
      const { data: profiles } = await admin.from('profiles').select('user_id, display_name, avatar_url').in('user_id', ids);
      const pMap = new Map(((profiles as { user_id: string; display_name: string | null; avatar_url: string | null }[] | null) || []).map(p => [p.user_id, p]));
      const enriched = (activity || []).map((a: Record<string, unknown>) => {
        const author = pMap.get(a.actor_id as string);
        return { ...a, actor_name: author?.display_name || 'Unknown', actor_avatar: author?.avatar_url || null };
      });
      return jsonResponse({ activity: enriched });
    }

    // ─── LIST LINKED TASKS ───
    if (action === 'list_linked_tasks') {
      const { ticket_id } = payload;
      if (!ticket_id) return jsonResponse({ error: 'ticket_id required' }, 400);
      const { data: existing } = await admin.from('tickets').select('*').eq('id', ticket_id).maybeSingle();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const ticket = existing as TicketRow;
      if (!(await userHasTicketAccess(admin, ticket, actorId, roles))) return jsonResponse({ error: 'Forbidden' }, 403);
      const { data, error } = await admin.from('tasks').select('*').eq('ticket_id', ticket_id).order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ tasks: data || [] });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('tickets error:', message, err);
    return jsonResponse({ error: `Server error: ${message}` }, 500);
  }
});

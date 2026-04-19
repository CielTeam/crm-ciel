import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ─── Schemas ───
const EventTypeEnum = z.enum(['meeting', 'deadline', 'reminder', 'personal', 'block', 'ticket_due', 'task_due']);
const VisibilityEnum = z.enum(['private', 'participants', 'department', 'management_chain']);
const ChannelEnum = z.enum(['in_app', 'browser_push', 'email']);
const ResponseEnum = z.enum(['pending', 'accepted', 'declined', 'tentative']);

const ReminderSchema = z.object({
  channel: ChannelEnum.default('in_app'),
  offset_minutes: z.number().int().min(0).max(40320), // ≤ 28 days
});

const ListSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  include_aggregated: z.boolean().default(true),
});

const CreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  event_type: EventTypeEnum.default('meeting'),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  all_day: z.boolean().default(false),
  location: z.string().max(500).optional().nullable(),
  visibility: VisibilityEnum.default('private'),
  account_id: z.string().uuid().optional().nullable(),
  ticket_id: z.string().uuid().optional().nullable(),
  task_id: z.string().uuid().optional().nullable(),
  recurrence_rule: z.string().max(500).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  participants: z.array(z.string().min(1)).max(100).default([]),
  reminders: z.array(ReminderSchema).max(10).optional(),
});

const UpdateSchema = CreateSchema.partial().extend({ event_id: z.string().uuid() });
const DeleteSchema = z.object({ event_id: z.string().uuid() });
const RespondSchema = z.object({ event_id: z.string().uuid(), response: ResponseEnum });
const AddReminderSchema = z.object({ event_id: z.string().uuid(), channel: ChannelEnum, offset_minutes: z.number().int().min(0).max(40320) });
const DelReminderSchema = z.object({ reminder_id: z.string().uuid() });

function sanitize(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  return v.replace(/<[^>]*>/g, '').trim().substring(0, max);
}

function computeFireAt(startISO: string, offsetMin: number): string {
  return new Date(new Date(startISO).getTime() - offsetMin * 60_000).toISOString();
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string | null;
  visibility: string;
  created_by: string;
  owner_user_id: string;
  account_id: string | null;
  ticket_id: string | null;
  task_id: string | null;
  recurrence_rule: string | null;
  color: string | null;
}

interface NormalizedEvent {
  id: string;
  source: 'event' | 'task' | 'leave' | 'ticket';
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  event_type?: string;
  status?: string;
  priority?: string;
  color?: string;
  linked_account_id?: string | null;
  linked_ticket_id?: string | null;
  linked_task_id?: string | null;
  visibility?: string;
  is_organizer?: boolean;
  response?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try { actorId = await verifyAuth0Jwt(req); }
  catch (err) {
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'calendar_event', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!checkRateLimit(`cal:${actorId}`, 60, 60_000)) {
    return jsonResponse({ error: 'Too many requests' }, 429);
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { action, ...payload } = body;

    // Helper: load visible user ids
    async function loadVisibleIds(): Promise<string[]> {
      const { data, error } = await admin.rpc('get_visible_user_ids', { _user_id: actorId });
      if (error) return [actorId];
      return (data || []).map((r: { uid: string }) => r.uid);
    }

    // Helper: check event access via RPC-equivalent (re-implements logic for service-role queries)
    async function hasEventAccess(eventId: string): Promise<boolean> {
      const { data: ev } = await admin.from('calendar_events').select('id, created_by, owner_user_id, visibility, deleted_at').eq('id', eventId).maybeSingle();
      if (!ev || ev.deleted_at) return false;
      if (ev.created_by === actorId || ev.owner_user_id === actorId) return true;
      const { data: part } = await admin.from('calendar_event_participants').select('id').eq('event_id', eventId).eq('user_id', actorId).maybeSingle();
      if (part) return true;
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', actorId);
      const roleSet = new Set((roles || []).map((r: { role: string }) => r.role));
      const isExec = ['chairman','vice_president','head_of_operations','technical_lead','team_development_lead'].some(r => roleSet.has(r));
      if (isExec) return true;
      if (ev.visibility === 'department') {
        const { data: pCaller } = await admin.from('profiles').select('department_id').eq('user_id', actorId).maybeSingle();
        const { data: pOwner } = await admin.from('profiles').select('department_id').eq('user_id', ev.owner_user_id).maybeSingle();
        if (pCaller?.department_id && pCaller.department_id === pOwner?.department_id) return true;
      }
      if (ev.visibility === 'management_chain') {
        const visible = await loadVisibleIds();
        if (visible.includes(ev.owner_user_id)) return true;
      }
      return false;
    }

    // ─── LIST ───
    if (action === 'list') {
      const parsed = ListSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      const { from, to, include_aggregated } = parsed.data;
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      if (toMs - fromMs > 90 * 86400_000) return jsonResponse({ error: 'Window too large (max 90 days)' }, 400);
      if (toMs <= fromMs) return jsonResponse({ error: 'Invalid window' }, 400);

      const visible = await loadVisibleIds();

      // Native events: caller is creator/owner/participant, or owner is in visible set (covers mgmt chain), capped 1000
      const { data: ownEvents } = await admin
        .from('calendar_events')
        .select('*')
        .is('deleted_at', null)
        .gte('start_time', from)
        .lte('start_time', to)
        .or(`owner_user_id.eq.${actorId},created_by.eq.${actorId}`)
        .limit(500);

      const { data: visibleOwnerEvents } = await admin
        .from('calendar_events')
        .select('*')
        .is('deleted_at', null)
        .gte('start_time', from)
        .lte('start_time', to)
        .in('owner_user_id', visible.length ? visible : [actorId])
        .limit(500);

      const { data: participantRows } = await admin
        .from('calendar_event_participants')
        .select('event_id')
        .eq('user_id', actorId);
      const participantEventIds = (participantRows || []).map((r: { event_id: string }) => r.event_id);

      const { data: participantEvents } = participantEventIds.length
        ? await admin.from('calendar_events').select('*').is('deleted_at', null).gte('start_time', from).lte('start_time', to).in('id', participantEventIds).limit(500)
        : { data: [] as EventRow[] };

      // Merge & dedupe
      const eventMap = new Map<string, EventRow>();
      for (const e of [...(ownEvents || []), ...(visibleOwnerEvents || []), ...(participantEvents || [])]) {
        eventMap.set(e.id, e as EventRow);
      }

      // Defense in depth: re-validate access per event
      const accessibleEvents: EventRow[] = [];
      for (const e of eventMap.values()) {
        if (await hasEventAccess(e.id)) accessibleEvents.push(e);
      }

      // Load participants & responses for accessible events
      const evIds = accessibleEvents.map(e => e.id);
      const { data: allParts } = evIds.length
        ? await admin.from('calendar_event_participants').select('event_id, user_id, response, is_organizer').in('event_id', evIds)
        : { data: [] as { event_id: string; user_id: string; response: string; is_organizer: boolean }[] };
      const partsByEvent = new Map<string, { user_id: string; response: string; is_organizer: boolean }[]>();
      for (const p of allParts || []) {
        const arr = partsByEvent.get(p.event_id) || [];
        arr.push({ user_id: p.user_id, response: p.response, is_organizer: p.is_organizer });
        partsByEvent.set(p.event_id, arr);
      }

      const normalized: NormalizedEvent[] = accessibleEvents.map(e => {
        const myPart = (partsByEvent.get(e.id) || []).find(p => p.user_id === actorId);
        return {
          id: e.id,
          source: 'event',
          title: e.title,
          start: e.start_time,
          end: e.end_time,
          all_day: e.all_day,
          event_type: e.event_type,
          color: e.color || undefined,
          linked_account_id: e.account_id,
          linked_ticket_id: e.ticket_id,
          linked_task_id: e.task_id,
          visibility: e.visibility,
          is_organizer: e.owner_user_id === actorId || e.created_by === actorId || !!myPart?.is_organizer,
          response: myPart?.response ?? null,
        };
      });

      // Aggregated feed
      if (include_aggregated) {
        // Tasks with due_date in window — visible to caller
        const { data: tasks } = await admin
          .from('tasks')
          .select('id, title, due_date, status, priority, created_by, assigned_to')
          .gte('due_date', from)
          .lte('due_date', to)
          .or(`created_by.eq.${actorId},assigned_to.eq.${actorId}`)
          .limit(500);
        for (const t of tasks || []) {
          if (!t.due_date) continue;
          normalized.push({
            id: `task:${t.id}`,
            source: 'task',
            title: t.title,
            start: t.due_date,
            end: t.due_date,
            all_day: false,
            status: t.status,
            priority: t.priority,
            color: t.status === 'done' ? 'success' : t.priority === 'high' ? 'destructive' : 'primary',
            linked_task_id: t.id,
          });
        }

        // Leaves
        const { data: leaves } = await admin
          .from('leaves')
          .select('id, leave_type, start_date, end_date, status, user_id')
          .eq('user_id', actorId)
          .is('deleted_at', null)
          .or(`start_date.lte.${to.slice(0,10)},end_date.gte.${from.slice(0,10)}`)
          .limit(200);
        for (const l of leaves || []) {
          if (l.status === 'cancelled' || l.status === 'rejected') continue;
          normalized.push({
            id: `leave:${l.id}`,
            source: 'leave',
            title: `${(l.leave_type || 'Leave').charAt(0).toUpperCase()}${(l.leave_type || 'leave').slice(1)} Leave`,
            start: new Date(l.start_date).toISOString(),
            end: new Date(l.end_date).toISOString(),
            all_day: true,
            status: l.status,
            color: l.status === 'approved' ? 'success' : 'warning',
          });
        }

        // Tickets — visible via creator/assigned/technical owner
        const { data: tickets } = await admin
          .from('tickets')
          .select('id, title, status, priority, created_by, assigned_to, technical_owner_id, opened_at')
          .or(`created_by.eq.${actorId},assigned_to.eq.${actorId},technical_owner_id.eq.${actorId}`)
          .in('status', ['open', 'in_progress', 'waiting'])
          .gte('opened_at', from)
          .lte('opened_at', to)
          .limit(300);
        for (const tk of tickets || []) {
          normalized.push({
            id: `ticket:${tk.id}`,
            source: 'ticket',
            title: `🎫 ${tk.title}`,
            start: tk.opened_at,
            end: tk.opened_at,
            all_day: false,
            status: tk.status,
            priority: tk.priority,
            color: tk.priority === 'urgent' ? 'destructive' : tk.priority === 'high' ? 'warning' : 'info',
            linked_ticket_id: tk.id,
          });
        }
      }

      normalized.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      return jsonResponse({ events: normalized });
    }

    // ─── GET (single event with participants & reminders) ───
    if (action === 'get') {
      const eventId = payload.event_id;
      if (typeof eventId !== 'string') return jsonResponse({ error: 'event_id required' }, 400);
      if (!(await hasEventAccess(eventId))) return jsonResponse({ error: 'Forbidden' }, 403);
      const { data: event } = await admin.from('calendar_events').select('*').eq('id', eventId).maybeSingle();
      if (!event) return jsonResponse({ error: 'Not found' }, 404);
      const { data: participants } = await admin.from('calendar_event_participants').select('*').eq('event_id', eventId);
      const { data: reminders } = await admin.from('event_reminders').select('*').eq('event_id', eventId).eq('user_id', actorId);
      return jsonResponse({ event, participants: participants || [], reminders: reminders || [] });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const parsed = CreateSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      const d = parsed.data;
      if (new Date(d.end_time).getTime() <= new Date(d.start_time).getTime()) {
        return jsonResponse({ error: 'end_time must be after start_time' }, 400);
      }

      // Restrict participants to caller's visible set
      const visible = await loadVisibleIds();
      const visibleSet = new Set(visible);
      const safeParticipants = d.participants.filter(p => visibleSet.has(p) || p === actorId);

      const { data: event, error } = await admin.from('calendar_events').insert({
        title: sanitize(d.title, 255)!,
        description: sanitize(d.description ?? null, 5000),
        event_type: d.event_type,
        start_time: d.start_time,
        end_time: d.end_time,
        all_day: d.all_day,
        location: sanitize(d.location ?? null, 500),
        visibility: d.visibility,
        created_by: actorId,
        owner_user_id: actorId,
        account_id: d.account_id ?? null,
        ticket_id: d.ticket_id ?? null,
        task_id: d.task_id ?? null,
        recurrence_rule: d.recurrence_rule ?? null,
        color: d.color ?? null,
      }).select('*').single();
      if (error) throw error;

      // Participants — always include organizer
      const partsToInsert = [
        { event_id: event.id, user_id: actorId, is_organizer: true, response: 'accepted' },
        ...safeParticipants.filter(p => p !== actorId).map(uid => ({ event_id: event.id, user_id: uid, is_organizer: false, response: 'pending' })),
      ];
      await admin.from('calendar_event_participants').insert(partsToInsert);

      // Reminders — defaults if omitted
      const reminderDefs = d.reminders ?? [{ channel: 'in_app' as const, offset_minutes: 60 }, { channel: 'in_app' as const, offset_minutes: 15 }];
      const reminderRows = reminderDefs.map(r => ({
        event_id: event.id,
        user_id: actorId, // caller's reminders only — others can self-add
        channel: r.channel,
        offset_minutes: r.offset_minutes,
        fire_at: computeFireAt(d.start_time, r.offset_minutes),
        status: 'pending',
      }));
      if (reminderRows.length) await admin.from('event_reminders').insert(reminderRows);

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'calendar_event.create', target_type: 'calendar_event', target_id: event.id, metadata: { title: event.title } });

      return jsonResponse({ event });
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const parsed = UpdateSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      const { event_id, participants, reminders, ...fields } = parsed.data;

      const { data: existing } = await admin.from('calendar_events').select('*').eq('id', event_id).maybeSingle();
      if (!existing || existing.deleted_at) return jsonResponse({ error: 'Not found' }, 404);
      if (existing.owner_user_id !== actorId && existing.created_by !== actorId) {
        return jsonResponse({ error: 'Only organizer can edit' }, 403);
      }

      const update: Record<string, unknown> = {};
      if (fields.title) update.title = sanitize(fields.title, 255);
      if (fields.description !== undefined) update.description = sanitize(fields.description ?? null, 5000);
      if (fields.event_type) update.event_type = fields.event_type;
      if (fields.start_time) update.start_time = fields.start_time;
      if (fields.end_time) update.end_time = fields.end_time;
      if (fields.all_day !== undefined) update.all_day = fields.all_day;
      if (fields.location !== undefined) update.location = sanitize(fields.location ?? null, 500);
      if (fields.visibility) update.visibility = fields.visibility;
      if (fields.account_id !== undefined) update.account_id = fields.account_id;
      if (fields.ticket_id !== undefined) update.ticket_id = fields.ticket_id;
      if (fields.task_id !== undefined) update.task_id = fields.task_id;
      if (fields.recurrence_rule !== undefined) update.recurrence_rule = fields.recurrence_rule;
      if (fields.color !== undefined) update.color = fields.color;

      const newStart = (update.start_time as string) ?? existing.start_time;
      const newEnd = (update.end_time as string) ?? existing.end_time;
      if (new Date(newEnd).getTime() <= new Date(newStart).getTime()) {
        return jsonResponse({ error: 'end_time must be after start_time' }, 400);
      }

      const { error } = await admin.from('calendar_events').update(update).eq('id', event_id);
      if (error) throw error;

      // Participants replace (excluding organizer self-row preserved)
      if (Array.isArray(participants)) {
        const visible = await loadVisibleIds();
        const visibleSet = new Set(visible);
        const safe = participants.filter(p => visibleSet.has(p) || p === actorId);
        await admin.from('calendar_event_participants').delete().eq('event_id', event_id).neq('user_id', actorId);
        const inserts = safe.filter(p => p !== actorId).map(uid => ({ event_id, user_id: uid, is_organizer: false, response: 'pending' }));
        if (inserts.length) await admin.from('calendar_event_participants').insert(inserts);
      }

      // Recompute fire_at for caller's existing reminders if start changed
      if (update.start_time) {
        const { data: myReminders } = await admin.from('event_reminders').select('id, offset_minutes').eq('event_id', event_id).eq('user_id', actorId).eq('status', 'pending');
        for (const r of myReminders || []) {
          await admin.from('event_reminders').update({ fire_at: computeFireAt(newStart, r.offset_minutes) }).eq('id', r.id);
        }
      }

      // Replace caller's reminders if explicitly provided
      if (Array.isArray(reminders)) {
        await admin.from('event_reminders').delete().eq('event_id', event_id).eq('user_id', actorId).eq('status', 'pending');
        const rows = reminders.map(r => ({
          event_id, user_id: actorId, channel: r.channel, offset_minutes: r.offset_minutes,
          fire_at: computeFireAt(newStart, r.offset_minutes), status: 'pending',
        }));
        if (rows.length) await admin.from('event_reminders').insert(rows);
      }

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'calendar_event.update', target_type: 'calendar_event', target_id: event_id, metadata: update });
      return jsonResponse({ success: true });
    }

    // ─── DELETE (soft) ───
    if (action === 'delete') {
      const parsed = DeleteSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      const { data: existing } = await admin.from('calendar_events').select('owner_user_id, created_by, deleted_at').eq('id', parsed.data.event_id).maybeSingle();
      if (!existing || existing.deleted_at) return jsonResponse({ error: 'Not found' }, 404);
      if (existing.owner_user_id !== actorId && existing.created_by !== actorId) return jsonResponse({ error: 'Only organizer can delete' }, 403);

      await admin.from('calendar_events').update({ deleted_at: new Date().toISOString() }).eq('id', parsed.data.event_id);
      await admin.from('event_reminders').update({ status: 'cancelled' }).eq('event_id', parsed.data.event_id).eq('status', 'pending');
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'calendar_event.delete', target_type: 'calendar_event', target_id: parsed.data.event_id });
      return jsonResponse({ success: true });
    }

    // ─── RESPOND ───
    if (action === 'respond') {
      const parsed = RespondSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      const { data: part } = await admin.from('calendar_event_participants').select('id').eq('event_id', parsed.data.event_id).eq('user_id', actorId).maybeSingle();
      if (!part) return jsonResponse({ error: 'Not a participant' }, 403);
      await admin.from('calendar_event_participants').update({ response: parsed.data.response }).eq('id', part.id);
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'calendar_event.respond', target_type: 'calendar_event', target_id: parsed.data.event_id, metadata: { response: parsed.data.response } });
      return jsonResponse({ success: true });
    }

    // ─── ADD REMINDER (caller only) ───
    if (action === 'add_reminder') {
      const parsed = AddReminderSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      if (!(await hasEventAccess(parsed.data.event_id))) return jsonResponse({ error: 'Forbidden' }, 403);
      const { data: ev } = await admin.from('calendar_events').select('start_time').eq('id', parsed.data.event_id).maybeSingle();
      if (!ev) return jsonResponse({ error: 'Not found' }, 404);
      const { data: row, error } = await admin.from('event_reminders').insert({
        event_id: parsed.data.event_id,
        user_id: actorId,
        channel: parsed.data.channel,
        offset_minutes: parsed.data.offset_minutes,
        fire_at: computeFireAt(ev.start_time, parsed.data.offset_minutes),
        status: 'pending',
      }).select('*').single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'calendar_event.reminder.add', target_type: 'calendar_event', target_id: parsed.data.event_id, metadata: { offset_minutes: parsed.data.offset_minutes } });
      return jsonResponse({ reminder: row });
    }

    // ─── DELETE REMINDER ───
    if (action === 'delete_reminder') {
      const parsed = DelReminderSchema.safeParse(payload);
      if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
      const { data: r } = await admin.from('event_reminders').select('id, user_id, event_id').eq('id', parsed.data.reminder_id).maybeSingle();
      if (!r || r.user_id !== actorId) return jsonResponse({ error: 'Forbidden' }, 403);
      await admin.from('event_reminders').delete().eq('id', parsed.data.reminder_id);
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'calendar_event.reminder.delete', target_type: 'calendar_event', target_id: r.event_id });
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('calendar-events error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
});

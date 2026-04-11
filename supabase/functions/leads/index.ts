import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Auth0 JWT Verification (same pattern as other functions) ───

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

// ─── Helpers ───

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_ROLES = ['chairman', 'vice_president', 'head_of_operations'];

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function sanitize(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
}

async function broadcastNotification(admin: ReturnType<typeof createClient>, userId: string, notification: Record<string, unknown>) {
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
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Verify role
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', actorId);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r: string) => ALLOWED_ROLES.includes(r))) {
      return json({ error: 'Forbidden — insufficient role' }, 403);
    }

    const body = await req.json();
    const { action, ...payload } = body;

    // ─── LIST ───
    if (action === 'list') {
      let query = admin.from('leads').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (payload.status) query = query.eq('status', payload.status);
      const { data, error } = await query;
      if (error) throw error;
      return json({ leads: data || [] });
    }

    // ─── STATS ───
    if (action === 'stats') {
      const { count: total } = await admin.from('leads').select('*', { count: 'exact', head: true }).is('deleted_at', null);
      const { count: active } = await admin.from('leads').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'active');
      const { count: lost } = await admin.from('leads').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'lost');

      // Count services expiring within 30 days
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      const { count: expiring_30 } = await admin.from('lead_services').select('*', { count: 'exact', head: true })
        .is('deleted_at', null).eq('status', 'active').lte('expiry_date', in30).gte('expiry_date', now.toISOString().slice(0, 10));

      return json({ stats: { total: total || 0, active: active || 0, expiring_30: expiring_30 || 0, lost: lost || 0 } });
    }

    // ─── GET ───
    if (action === 'get') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { data, error } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (error) throw error;
      return json({ lead: data });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const company_name = sanitize(payload.company_name, 255);
      const contact_name = sanitize(payload.contact_name, 255);
      if (!company_name || !contact_name) return json({ error: 'company_name and contact_name required' }, 400);
      const { data, error } = await admin.from('leads').insert({
        company_name,
        contact_name,
        contact_email: sanitize(payload.contact_email, 255) || null,
        contact_phone: sanitize(payload.contact_phone, 50) || null,
        status: ['potential', 'active', 'inactive', 'lost'].includes(payload.status) ? payload.status : 'potential',
        source: sanitize(payload.source, 255) || null,
        notes: sanitize(payload.notes, 5000) || null,
        created_by: actorId,
        assigned_to: payload.assigned_to || null,
      }).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'lead.create', target_type: 'lead', target_id: data.id, metadata: { company_name } });
      return json({ lead: data }, 201);
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const fields: Record<string, unknown> = {};
      if (updates.company_name !== undefined) fields.company_name = sanitize(updates.company_name, 255);
      if (updates.contact_name !== undefined) fields.contact_name = sanitize(updates.contact_name, 255);
      if (updates.contact_email !== undefined) fields.contact_email = sanitize(updates.contact_email, 255) || null;
      if (updates.contact_phone !== undefined) fields.contact_phone = sanitize(updates.contact_phone, 50) || null;
      if (updates.status !== undefined && ['potential', 'active', 'inactive', 'lost'].includes(updates.status)) fields.status = updates.status;
      if (updates.source !== undefined) fields.source = sanitize(updates.source, 255) || null;
      if (updates.notes !== undefined) fields.notes = sanitize(updates.notes, 5000) || null;
      if (updates.assigned_to !== undefined) fields.assigned_to = updates.assigned_to || null;

      const { data, error } = await admin.from('leads').update(fields).eq('id', id).is('deleted_at', null).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'lead.update', target_type: 'lead', target_id: id });
      return json({ lead: data });
    }

    // ─── DELETE (soft) ───
    if (action === 'delete') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await admin.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'lead.delete', target_type: 'lead', target_id: id });
      return json({ success: true });
    }

    // ─── LIST SERVICES ───
    if (action === 'list_services') {
      const { lead_id } = payload;
      if (!lead_id) return json({ error: 'lead_id required' }, 400);
      const { data, error } = await admin.from('lead_services').select('*').eq('lead_id', lead_id).is('deleted_at', null).order('expiry_date', { ascending: true });
      if (error) throw error;
      return json({ services: data || [] });
    }

    // ─── ADD SERVICE ───
    if (action === 'add_service') {
      const service_name = sanitize(payload.service_name, 255);
      if (!service_name || !payload.lead_id || !payload.expiry_date) return json({ error: 'service_name, lead_id, and expiry_date required' }, 400);
      const { data, error } = await admin.from('lead_services').insert({
        lead_id: payload.lead_id,
        service_name,
        description: sanitize(payload.description, 2000) || null,
        start_date: payload.start_date || null,
        expiry_date: payload.expiry_date,
      }).select().single();
      if (error) throw error;
      return json({ service: data }, 201);
    }

    // ─── UPDATE SERVICE ───
    if (action === 'update_service') {
      const { id, ...updates } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const fields: Record<string, unknown> = {};
      if (updates.service_name !== undefined) fields.service_name = sanitize(updates.service_name, 255);
      if (updates.description !== undefined) fields.description = sanitize(updates.description, 2000) || null;
      if (updates.start_date !== undefined) fields.start_date = updates.start_date || null;
      if (updates.expiry_date !== undefined) fields.expiry_date = updates.expiry_date;
      if (updates.status !== undefined && ['active', 'expired', 'renewed'].includes(updates.status)) fields.status = updates.status;
      const { data, error } = await admin.from('lead_services').update(fields).eq('id', id).is('deleted_at', null).select().single();
      if (error) throw error;
      return json({ service: data });
    }

    // ─── DELETE SERVICE (soft) ───
    if (action === 'delete_service') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await admin.from('lead_services').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('leads error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

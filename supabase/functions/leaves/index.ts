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

// ─── Edge Function ───

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const REVIEWER_ROLES = ['chairman', 'vice_president', 'hr', 'head_of_operations', 'team_development_lead', 'technical_lead', 'head_of_accounting', 'head_of_marketing', 'sales_lead'];
const LEAVE_TYPES = ['annual', 'sick', 'personal', 'unpaid'];
const BALANCE_COLS: Record<string, { total: string; used: string }> = {
  annual: { total: 'annual', used: 'used_annual' },
  sick: { total: 'sick', used: 'used_sick' },
  personal: { total: 'personal', used: 'used_personal' },
};

function diffDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    const { action, ...payload } = body;

    // BALANCES
    if (action === 'balances') {
      // eslint-disable-next-line prefer-const
      let { data, error } = await admin.from('leave_balances').select('*').eq('user_id', actorId).maybeSingle();
      if (!data && !error) {
        const { data: created, error: cErr } = await admin.from('leave_balances').insert({ user_id: actorId }).select().single();
        if (cErr) throw cErr;
        data = created;
      }
      if (error) throw error;
      return new Response(JSON.stringify({ balances: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // LIST
    if (action === 'list') {
      const { include_team } = payload;
      let query = admin.from('leaves').select('*').is('deleted_at', null);
      if (!include_team) query = query.eq('user_id', actorId);
      query = query.order('created_at', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ leaves: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // CREATE
    if (action === 'create') {
      const { leave_type, start_date, end_date, reason } = payload;
      if (!LEAVE_TYPES.includes(leave_type)) return new Response(JSON.stringify({ error: 'Invalid leave type' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (!start_date || !end_date || new Date(end_date) < new Date(start_date)) return new Response(JSON.stringify({ error: 'Invalid dates' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      if (leave_type !== 'unpaid') {
        const cols = BALANCE_COLS[leave_type];
        let { data: bal } = await admin.from('leave_balances').select('*').eq('user_id', actorId).maybeSingle();
        if (!bal) { const { data: created } = await admin.from('leave_balances').insert({ user_id: actorId }).select().single(); bal = created; }
        const days = diffDays(start_date, end_date);
        const remaining = (bal as Record<string, number>)[cols.total] - (bal as Record<string, number>)[cols.used];
        if (days > remaining) return new Response(JSON.stringify({ error: `Insufficient ${leave_type} balance. ${remaining} days remaining.` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await admin.from('leaves').insert({ user_id: actorId, leave_type, start_date, end_date, reason: reason || null }).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'leave.create', target_type: 'leave', target_id: data.id, metadata: { leave_type, start_date, end_date } });
      return new Response(JSON.stringify({ leave: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // REVIEW
    if (action === 'review') {
      const { leave_id, decision, reviewer_note } = payload;
      if (!['approved', 'rejected'].includes(decision)) return new Response(JSON.stringify({ error: 'Invalid decision' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      // Verify reviewer role from DB
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', actorId);
      const hasReviewerRole = roles?.some((r: { role: string }) => REVIEWER_ROLES.includes(r.role));
      if (!hasReviewerRole) return new Response(JSON.stringify({ error: 'Forbidden: insufficient role' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: leave } = await admin.from('leaves').select('*').eq('id', leave_id).single();
      if (!leave || leave.status !== 'pending') return new Response(JSON.stringify({ error: 'Leave not found or not pending' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: updated, error } = await admin.from('leaves').update({ status: decision, reviewer_id: actorId, reviewed_at: new Date().toISOString(), reviewer_note: reviewer_note || null }).eq('id', leave_id).select().single();
      if (error) throw error;

      if (decision === 'approved' && leave.leave_type !== 'unpaid') {
        const cols = BALANCE_COLS[leave.leave_type];
        const days = diffDays(leave.start_date, leave.end_date);
        const { data: bal } = await admin.from('leave_balances').select('*').eq('user_id', leave.user_id).single();
        if (bal) await admin.from('leave_balances').update({ [(cols.used)]: (bal as Record<string, number>)[cols.used] + days }).eq('user_id', leave.user_id);
      }

      await admin.from('audit_logs').insert({ actor_id: actorId, action: `leave.${decision}`, target_type: 'leave', target_id: leave_id, metadata: { decision, reviewer_note } });
      const notifType = decision === 'approved' ? 'leave_approved' : 'leave_rejected';
      const notifTitle = decision === 'approved' ? 'Your leave request has been approved' : 'Your leave request has been rejected';
      await admin.from('notifications').insert({ user_id: leave.user_id, type: notifType, title: notifTitle, body: reviewer_note || `${leave.leave_type} leave: ${leave.start_date} – ${leave.end_date}`, reference_id: leave_id, reference_type: 'leave' });

      return new Response(JSON.stringify({ leave: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // CANCEL
    if (action === 'cancel') {
      const { leave_id } = payload;
      const { data: leave } = await admin.from('leaves').select('*').eq('id', leave_id).single();
      if (!leave || leave.user_id !== actorId || leave.status !== 'pending') return new Response(JSON.stringify({ error: 'Cannot cancel this leave' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { data: updated, error } = await admin.from('leaves').update({ status: 'cancelled' }).eq('id', leave_id).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'leave.cancel', target_type: 'leave', target_id: leave_id });
      return new Response(JSON.stringify({ leave: updated }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('leaves error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

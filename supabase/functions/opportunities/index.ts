import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Auth0 JWT Verification (mirrors leads function) ───
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_ROLES = ['chairman', 'vice_president', 'head_of_operations'];
const VALID_STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'] as const;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function sanitize(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
}

async function getScopedUserIds(admin: ReturnType<typeof createClient>, actorId: string): Promise<string[] | null> {
  const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', actorId);
  const roles = (roleRows || []).map((r: { role: string }) => r.role);
  if (roles.includes('chairman') || roles.includes('vice_president')) return null;
  if (!roles.includes('head_of_operations')) return [];
  const { data: myTeams } = await admin.from('team_members').select('team_id').eq('user_id', actorId);
  if (!myTeams || myTeams.length === 0) return [actorId];
  const teamIds = myTeams.map((t: { team_id: string }) => t.team_id);
  const { data: members } = await admin.from('team_members').select('user_id').in('team_id', teamIds);
  return [...new Set([actorId, ...(members || []).map((m: { user_id: string }) => m.user_id)])];
}
function filterByScope(rows: Record<string, unknown>[], scopedIds: string[] | null, ownerKey = 'owner'): Record<string, unknown>[] {
  if (scopedIds === null) return rows;
  return rows.filter(r => {
    const o = r[ownerKey] as string | null;
    return o === null || scopedIds.includes(o);
  });
}

function computeWeighted(value: number | null | undefined, prob: number | null | undefined): number {
  const v = Number(value || 0);
  const p = Number(prob || 0);
  return Math.round(v * (p / 100) * 100) / 100;
}

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

    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', actorId);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r: string) => ALLOWED_ROLES.includes(r))) {
      return json({ error: 'Forbidden — insufficient role' }, 403);
    }

    const scopedIds = await getScopedUserIds(admin, actorId);
    const body = await req.json();
    const { action, ...payload } = body;

    if (action === 'list') {
      let query = admin.from('opportunities').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (typeof payload.account_id === 'string') query = query.eq('account_id', payload.account_id);
      if (typeof payload.stage === 'string') query = query.eq('stage', payload.stage);
      const { data, error } = await query;
      if (error) throw error;
      return json({ opportunities: filterByScope(data || [], scopedIds) });
    }

    if (action === 'create_opportunity') {
      const name = sanitize(payload.name, 255);
      if (!name) return json({ error: 'name required' }, 400);
      const stage = VALID_STAGES.includes(payload.stage) ? payload.stage : 'prospecting';
      const value = payload.estimated_value != null ? Number(payload.estimated_value) : null;
      const prob = payload.probability_percent != null ? Number(payload.probability_percent) : 0;
      const weighted = value != null ? computeWeighted(value, prob) : null;

      const { data: opp, error } = await admin.from('opportunities').insert({
        name,
        account_id: payload.account_id || null,
        contact_id: payload.contact_id || null,
        stage,
        estimated_value: value,
        currency: payload.currency || 'USD',
        probability_percent: prob,
        weighted_forecast: weighted,
        expected_close_date: payload.expected_close_date || null,
        notes: payload.notes ? sanitize(payload.notes, 5000) : null,
        owner: payload.owner || actorId,
        created_by: actorId,
        won_at: stage === 'won' ? new Date().toISOString() : null,
      }).select().single();
      if (error) throw error;

      await admin.from('audit_logs').insert({
        actor_id: actorId, action: 'opportunity.create', target_type: 'opportunity', target_id: opp.id,
        metadata: { name, stage, account_id: opp.account_id },
      });
      return json({ opportunity: opp });
    }

    if (action === 'update_opportunity') {
      const { id, ...rest } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { data: existing } = await admin.from('opportunities').select('*').eq('id', id).is('deleted_at', null).single();
      if (!existing) return json({ error: 'Not found' }, 404);
      if (scopedIds !== null && existing.owner && !scopedIds.includes(existing.owner)) {
        return json({ error: 'Forbidden' }, 403);
      }

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof rest.name === 'string') update.name = sanitize(rest.name, 255);
      if (typeof rest.stage === 'string' && VALID_STAGES.includes(rest.stage)) {
        update.stage = rest.stage;
        if (rest.stage === 'won' && !existing.won_at) update.won_at = new Date().toISOString();
        if (rest.stage !== 'won') update.won_at = null;
      }
      if ('estimated_value' in rest) update.estimated_value = rest.estimated_value != null ? Number(rest.estimated_value) : null;
      if ('probability_percent' in rest) update.probability_percent = Number(rest.probability_percent || 0);
      if ('expected_close_date' in rest) update.expected_close_date = rest.expected_close_date || null;
      if ('notes' in rest) update.notes = rest.notes ? sanitize(rest.notes, 5000) : null;
      if ('account_id' in rest) update.account_id = rest.account_id || null;
      if ('contact_id' in rest) update.contact_id = rest.contact_id || null;

      // Recompute weighted
      const finalValue = 'estimated_value' in update ? update.estimated_value as number | null : existing.estimated_value;
      const finalProb = 'probability_percent' in update ? update.probability_percent as number : existing.probability_percent;
      update.weighted_forecast = finalValue != null ? computeWeighted(finalValue, finalProb) : null;

      const { data: opp, error } = await admin.from('opportunities').update(update).eq('id', id).select().single();
      if (error) throw error;

      await admin.from('audit_logs').insert({
        actor_id: actorId, action: 'opportunity.update', target_type: 'opportunity', target_id: id,
        metadata: { changes: Object.keys(update) },
      });
      return json({ opportunity: opp });
    }

    if (action === 'change_stage') {
      const { id, stage } = payload;
      if (!id || !VALID_STAGES.includes(stage)) return json({ error: 'id and valid stage required' }, 400);
      const { data: existing } = await admin.from('opportunities').select('*').eq('id', id).is('deleted_at', null).single();
      if (!existing) return json({ error: 'Not found' }, 404);
      if (scopedIds !== null && existing.owner && !scopedIds.includes(existing.owner)) {
        return json({ error: 'Forbidden' }, 403);
      }
      const update: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
      if (stage === 'won') update.won_at = existing.won_at || new Date().toISOString();
      else update.won_at = null;
      const { data: opp, error } = await admin.from('opportunities').update(update).eq('id', id).select().single();
      if (error) throw error;
      await admin.from('audit_logs').insert({
        actor_id: actorId, action: 'opportunity.change_stage', target_type: 'opportunity', target_id: id,
        metadata: { from: existing.stage, to: stage },
      });
      return json({ opportunity: opp });
    }

    if (action === 'delete_opportunity') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { data: existing } = await admin.from('opportunities').select('owner').eq('id', id).single();
      if (!existing) return json({ error: 'Not found' }, 404);
      if (scopedIds !== null && existing.owner && !scopedIds.includes(existing.owner)) {
        return json({ error: 'Forbidden' }, 403);
      }
      await admin.from('opportunities').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      await admin.from('audit_logs').insert({
        actor_id: actorId, action: 'opportunity.delete', target_type: 'opportunity', target_id: id,
      });
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('opportunities error:', err);
    return json({ error: err instanceof Error ? err.message : 'Internal server error' }, 500);
  }
});

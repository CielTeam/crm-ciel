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
  const keys = await fetchJwks(auth0Domain);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Key not found');
  const key = await importRsaKey(jwk);
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
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

    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', actorId);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r: string) => ALLOWED_ROLES.includes(r))) {
      return json({ error: 'Forbidden — insufficient role' }, 403);
    }

    const body = await req.json();
    const { action, ...payload } = body;

    // ─── UPDATE ACCOUNT ───
    if (action === 'update_account') {
      const { id, ...fields } = payload;
      if (!id) return json({ error: 'Missing account id' }, 400);

      const { data: existing, error: fetchErr } = await admin.from('accounts').select('*').eq('id', id).is('deleted_at', null).single();
      if (fetchErr || !existing) return json({ error: 'Account not found' }, 404);

      const updates: Record<string, unknown> = {};
      const allowedFields = ['name', 'industry', 'email', 'phone', 'website', 'city', 'country', 'notes', 'tags'];

      for (const key of allowedFields) {
        if (key in fields) {
          if (key === 'tags') {
            updates[key] = Array.isArray(fields[key]) ? (fields[key] as string[]).map((t: string) => sanitize(t, 50)) : [];
          } else if (key === 'name') {
            const val = sanitize(fields[key], 200);
            if (!val) return json({ error: 'Name is required' }, 400);
            updates[key] = val;
          } else {
            updates[key] = fields[key] === null ? null : sanitize(fields[key], 500);
          }
        }
      }

      if (Object.keys(updates).length === 0) return json({ error: 'No valid fields to update' }, 400);

      const { data, error } = await admin.from('accounts').update(updates).eq('id', id).select().single();
      if (error) throw error;

      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'account.updated',
        target_type: 'account',
        target_id: id,
        metadata: { fields: Object.keys(updates) },
      });

      return json({ account: data });
    }

    // ─── UPDATE CONTACT ───
    if (action === 'update_contact') {
      const { id, ...fields } = payload;
      if (!id) return json({ error: 'Missing contact id' }, 400);

      const { data: existing, error: fetchErr } = await admin.from('contacts').select('*').eq('id', id).is('deleted_at', null).single();
      if (fetchErr || !existing) return json({ error: 'Contact not found' }, 404);

      const updates: Record<string, unknown> = {};
      const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'secondary_phone', 'job_title', 'notes'];

      for (const key of allowedFields) {
        if (key in fields) {
          if (key === 'first_name' || key === 'last_name') {
            const val = sanitize(fields[key], 100);
            if (!val) return json({ error: `${key} is required` }, 400);
            updates[key] = val;
          } else {
            updates[key] = fields[key] === null ? null : sanitize(fields[key], 500);
          }
        }
      }

      if (Object.keys(updates).length === 0) return json({ error: 'No valid fields to update' }, 400);

      const { data, error } = await admin.from('contacts').update(updates).eq('id', id).select().single();
      if (error) throw error;

      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'contact.updated',
        target_type: 'contact',
        target_id: id,
        metadata: { fields: Object.keys(updates) },
      });

      return json({ contact: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});

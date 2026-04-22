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
const VALID_ACCOUNT_STATUS = ['active', 'inactive', 'pending'];
const VALID_ACCOUNT_TYPE = ['prospect', 'customer', 'partner'];
const VALID_ACCOUNT_HEALTH = ['healthy', 'at_risk', 'critical'];
const VALID_NOTE_TYPES = ['general', 'call_log', 'email_log', 'meeting_log', 'follow_up'];

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function sanitize(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
}

function isValidCountryCode(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Z]{2}$/.test(v);
}

async function logActivity(
  admin: ReturnType<typeof createClient>,
  accountId: string,
  actorId: string,
  activityType: string,
  title: string,
  changes: Record<string, { old: unknown; new: unknown }> = {},
  metadata: Record<string, unknown> = {}
) {
  await admin.from('account_activities').insert({
    account_id: accountId,
    actor_id: actorId,
    activity_type: activityType,
    title,
    changes,
    metadata,
  });
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

    // ─── LIST ACCOUNTS (server-side filtering, scoped) ───
    if (action === 'list_accounts') {
      const f = (payload.filters || {}) as Record<string, unknown>;
      let query = admin.from('accounts').select('*').is('deleted_at', null);

      // Scope: chairman/VP see all; head_of_operations sees own + team
      const isGlobal = roles.some((r: string) => r === 'chairman' || r === 'vice_president');
      if (!isGlobal) {
        // Get team member ids for head_of_operations
        const { data: tm } = await admin.from('team_members').select('team_id').eq('user_id', actorId);
        const teamIds = (tm || []).map((t: { team_id: string }) => t.team_id);
        let allowedOwners: string[] = [actorId];
        if (teamIds.length > 0) {
          const { data: peers } = await admin.from('team_members').select('user_id').in('team_id', teamIds);
          allowedOwners = Array.from(new Set([actorId, ...(peers || []).map((p: { user_id: string }) => p.user_id)]));
        }
        query = query.in('owner', allowedOwners);
      }

      if (typeof f.search === 'string' && f.search.trim()) {
        const s = sanitize(f.search, 100);
        query = query.or(`name.ilike.%${s}%,email.ilike.%${s}%,industry.ilike.%${s}%`);
      }
      if (typeof f.owner === 'string' && f.owner) query = query.eq('owner', f.owner);
      if (typeof f.country_code === 'string' && isValidCountryCode(f.country_code)) query = query.eq('country_code', f.country_code);
      if (typeof f.industry === 'string' && f.industry.trim()) query = query.ilike('industry', `%${sanitize(f.industry, 100)}%`);
      if (typeof f.status === 'string' && VALID_ACCOUNT_STATUS.includes(f.status)) query = query.eq('account_status', f.status);
      if (typeof f.type === 'string' && VALID_ACCOUNT_TYPE.includes(f.type)) query = query.eq('account_type', f.type);
      if (typeof f.health === 'string' && VALID_ACCOUNT_HEALTH.includes(f.health)) query = query.eq('account_health', f.health);

      query = query.order('created_at', { ascending: false }).limit(500);
      const { data, error } = await query;
      if (error) throw error;
      return json({ accounts: data || [] });
    }

    // ─── LIST CONTACTS (server-side, scoped — mirrors list_accounts scope) ───
    if (action === 'list_contacts') {
      let query = admin.from('contacts').select('*').is('deleted_at', null);

      const isGlobal = roles.some((r: string) => r === 'chairman' || r === 'vice_president');
      if (!isGlobal) {
        const { data: tm } = await admin.from('team_members').select('team_id').eq('user_id', actorId);
        const teamIds = (tm || []).map((t: { team_id: string }) => t.team_id);
        let allowedOwners: string[] = [actorId];
        if (teamIds.length > 0) {
          const { data: peers } = await admin.from('team_members').select('user_id').in('team_id', teamIds);
          allowedOwners = Array.from(new Set([actorId, ...(peers || []).map((p: { user_id: string }) => p.user_id)]));
        }
        query = query.in('owner', allowedOwners);
      }

      query = query.order('created_at', { ascending: false }).limit(1000);
      const { data, error } = await query;
      if (error) throw error;
      return json({ contacts: data || [] });
    }

    // ─── CREATE ACCOUNT ───
    if (action === 'create_account') {
      const name = sanitize(payload.name, 200);
      if (!name) return json({ error: 'Name is required' }, 400);

      const accountStatus = VALID_ACCOUNT_STATUS.includes(payload.account_status) ? payload.account_status : 'active';
      const accountType = VALID_ACCOUNT_TYPE.includes(payload.account_type) ? payload.account_type : 'prospect';
      const accountHealth = VALID_ACCOUNT_HEALTH.includes(payload.account_health) ? payload.account_health : 'healthy';

      const insertData: Record<string, unknown> = {
        name,
        industry: sanitize(payload.industry, 100) || null,
        email: sanitize(payload.email, 255) || null,
        phone: sanitize(payload.phone, 50) || null,
        website: sanitize(payload.website, 500) || null,
        city: sanitize(payload.city, 255) || null,
        country: sanitize(payload.country, 255) || null,
        country_code: isValidCountryCode(payload.country_code) ? payload.country_code : null,
        country_name: sanitize(payload.country_name, 255) || null,
        state_province: sanitize(payload.state_province, 255) || null,
        notes: sanitize(payload.notes, 5000) || null,
        tags: Array.isArray(payload.tags) ? payload.tags.map((t: string) => sanitize(t, 50)).filter(Boolean) : [],
        owner: payload.owner || actorId,
        created_by: actorId,
        account_status: accountStatus,
        account_type: accountType,
        account_health: accountHealth,
      };

      const { data, error } = await admin.from('accounts').insert(insertData).select().single();
      if (error) throw error;

      await logActivity(admin, data.id, actorId, 'created', `Account "${name}" created`);
      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'account.created',
        target_type: 'account',
        target_id: data.id,
        metadata: { name },
      });

      return json({ account: data }, 201);
    }

    // ─── DELETE ACCOUNT (soft) ───
    if (action === 'delete_account') {
      const { id } = payload;
      if (!id) return json({ error: 'Missing account id' }, 400);

      const { error } = await admin.from('accounts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;

      await admin.from('contacts').update({ deleted_at: new Date().toISOString() }).eq('account_id', id);

      await logActivity(admin, id, actorId, 'deleted', 'Account archived');
      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'account.deleted',
        target_type: 'account',
        target_id: id,
      });

      return json({ success: true });
    }

    // ─── CREATE CONTACT ───
    if (action === 'create_contact') {
      const first_name = sanitize(payload.first_name, 100);
      const last_name = sanitize(payload.last_name, 100);
      if (!first_name || !last_name) return json({ error: 'First and last name are required' }, 400);

      const insertData: Record<string, unknown> = {
        first_name,
        last_name,
        email: sanitize(payload.email, 255) || null,
        phone: sanitize(payload.phone, 50) || null,
        secondary_phone: sanitize(payload.secondary_phone, 50) || null,
        job_title: sanitize(payload.job_title, 100) || null,
        notes: sanitize(payload.notes, 5000) || null,
        account_id: payload.account_id || null,
        owner: payload.owner || actorId,
        created_by: actorId,
      };

      const { data, error } = await admin.from('contacts').insert(insertData).select().single();
      if (error) throw error;

      if (data.account_id) {
        await logActivity(admin, data.account_id, actorId, 'contact_added', `Contact "${first_name} ${last_name}" added`, {}, { contact_id: data.id });
      }
      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'contact.created',
        target_type: 'contact',
        target_id: data.id,
        metadata: { name: `${first_name} ${last_name}` },
      });

      return json({ contact: data }, 201);
    }

    // ─── DELETE CONTACT (soft) ───
    if (action === 'delete_contact') {
      const { id } = payload;
      if (!id) return json({ error: 'Missing contact id' }, 400);

      const { data: existing } = await admin.from('contacts').select('account_id, first_name, last_name').eq('id', id).single();
      const { error } = await admin.from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;

      if (existing?.account_id) {
        await logActivity(admin, existing.account_id as string, actorId, 'contact_removed', `Contact "${existing.first_name} ${existing.last_name}" removed`);
      }
      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'contact.deleted',
        target_type: 'contact',
        target_id: id,
      });

      return json({ success: true });
    }

    // ─── UPDATE ACCOUNT ───
    if (action === 'update_account') {
      const { id, ...fields } = payload;
      if (!id) return json({ error: 'Missing account id' }, 400);

      const { data: existing, error: fetchErr } = await admin.from('accounts').select('*').eq('id', id).is('deleted_at', null).single();
      if (fetchErr || !existing) return json({ error: 'Account not found' }, 404);

      const updates: Record<string, unknown> = {};
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      const allowedFields = [
        'name', 'industry', 'email', 'phone', 'website', 'city', 'country',
        'country_code', 'country_name', 'state_province', 'notes', 'tags',
        'account_status', 'account_type', 'account_health',
      ];

      for (const key of allowedFields) {
        if (!(key in fields)) continue;
        let newVal: unknown;
        if (key === 'tags') {
          newVal = Array.isArray(fields[key]) ? (fields[key] as string[]).map((t: string) => sanitize(t, 50)) : [];
        } else if (key === 'name') {
          const val = sanitize(fields[key], 200);
          if (!val) return json({ error: 'Name is required' }, 400);
          newVal = val;
        } else if (key === 'country_code') {
          newVal = fields[key] === null ? null : (isValidCountryCode(fields[key]) ? fields[key] : null);
        } else if (key === 'account_status') {
          if (!VALID_ACCOUNT_STATUS.includes(fields[key])) return json({ error: 'Invalid account_status' }, 400);
          newVal = fields[key];
        } else if (key === 'account_type') {
          if (!VALID_ACCOUNT_TYPE.includes(fields[key])) return json({ error: 'Invalid account_type' }, 400);
          newVal = fields[key];
        } else if (key === 'account_health') {
          if (!VALID_ACCOUNT_HEALTH.includes(fields[key])) return json({ error: 'Invalid account_health' }, 400);
          newVal = fields[key];
        } else {
          newVal = fields[key] === null ? null : sanitize(fields[key], 500);
        }

        const oldVal = (existing as Record<string, unknown>)[key];
        if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
          updates[key] = newVal;
          changes[key] = { old: oldVal, new: newVal };
        }
      }

      if (Object.keys(updates).length === 0) return json({ account: existing });

      const { data, error } = await admin.from('accounts').update(updates).eq('id', id).select().single();
      if (error) throw error;

      // Special activity entries for lifecycle field changes
      const lifecycleFields = ['account_status', 'account_type', 'account_health'];
      for (const f of lifecycleFields) {
        if (changes[f]) {
          await logActivity(admin, id, actorId, `${f}_change`, `${f.replace('account_', '').replace('_', ' ')} changed`, { [f]: changes[f] });
        }
      }
      // General update activity for other field changes
      const otherChanges: Record<string, { old: unknown; new: unknown }> = {};
      for (const k of Object.keys(changes)) {
        if (!lifecycleFields.includes(k)) otherChanges[k] = changes[k];
      }
      if (Object.keys(otherChanges).length > 0) {
        await logActivity(admin, id, actorId, 'updated', 'Account details updated', otherChanges);
      }

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
      const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'secondary_phone', 'job_title', 'notes', 'account_id'];

      for (const key of allowedFields) {
        if (key in fields) {
          if (key === 'first_name' || key === 'last_name') {
            const val = sanitize(fields[key], 100);
            if (!val) return json({ error: `${key} is required` }, 400);
            updates[key] = val;
          } else if (key === 'account_id') {
            updates[key] = fields[key] || null;
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

    // ─── ADD NOTE (account) ───
    if (action === 'add_note') {
      const { account_id, note_type, content, outcome, next_step, contact_date, duration_minutes } = payload;
      if (!account_id || !content) return json({ error: 'account_id and content required' }, 400);
      const type = VALID_NOTE_TYPES.includes(note_type) ? note_type : 'general';

      // Verify account exists
      const { data: acct } = await admin.from('accounts').select('id, name').eq('id', account_id).is('deleted_at', null).single();
      if (!acct) return json({ error: 'Account not found' }, 404);

      const { data, error } = await admin.from('account_notes').insert({
        account_id,
        author_id: actorId,
        note_type: type,
        content: sanitize(content, 5000),
        outcome: sanitize(outcome, 500) || null,
        next_step: sanitize(next_step, 500) || null,
        contact_date: contact_date || null,
        duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      }).select().single();
      if (error) throw error;

      await logActivity(admin, account_id, actorId, 'note_added', `${type.replace('_', ' ')} added`, {}, { note_id: data.id, note_type: type });

      return json({ note: data }, 201);
    }

    // ─── LIST NOTES (account) ───
    if (action === 'list_notes') {
      const { account_id } = payload;
      if (!account_id) return json({ error: 'account_id required' }, 400);
      const { data, error } = await admin.from('account_notes').select('*')
        .eq('account_id', account_id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json({ notes: data || [] });
    }

    // ─── LIST ACTIVITIES (account) ───
    if (action === 'list_activities') {
      const { account_id } = payload;
      if (!account_id) return json({ error: 'account_id required' }, 400);
      const { data, error } = await admin.from('account_activities').select('*')
        .eq('account_id', account_id)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json({ activities: data || [] });
    }

    // ─── ADD SERVICE (account) ───
    if (action === 'add_service') {
      const { account_id, service_name, start_date, expiry_date, description } = payload;
      if (!account_id || !service_name || !expiry_date) {
        return json({ error: 'account_id, service_name, expiry_date required' }, 400);
      }

      const { data: acct } = await admin.from('accounts')
        .select('id, name, owner').eq('id', account_id).is('deleted_at', null).single();
      if (!acct) return json({ error: 'Account not found' }, 404);

      const cleanName = sanitize(service_name, 200);
      if (!cleanName) return json({ error: 'service_name required' }, 400);

      const { data, error } = await admin.from('account_services').insert({
        account_id,
        service_name: cleanName,
        description: sanitize(description, 1000) || null,
        start_date: start_date || null,
        expiry_date,
        status: 'active',
        created_by: actorId,
      }).select().single();
      if (error) throw error;

      await logActivity(
        admin, account_id, actorId, 'service_added',
        `Service "${cleanName}" added`, {},
        { service_id: data.id, service_name: cleanName, expiry_date }
      );

      return json({ service: data }, 201);
    }

    // ─── LIST SERVICES (account) ───
    if (action === 'list_services') {
      const { account_id } = payload;
      if (!account_id) return json({ error: 'account_id required' }, 400);
      const { data, error } = await admin.from('account_services').select('*')
        .eq('account_id', account_id).is('deleted_at', null)
        .order('expiry_date', { ascending: true }).limit(200);
      if (error) throw error;
      return json({ services: data || [] });
    }

    // ─── DELETE SERVICE (account, soft) ───
    if (action === 'delete_service') {
      const { service_id } = payload;
      if (!service_id) return json({ error: 'service_id required' }, 400);

      const { data: existing } = await admin.from('account_services')
        .select('id, account_id, service_name').eq('id', service_id).is('deleted_at', null).single();
      if (!existing) return json({ error: 'Service not found' }, 404);

      const { error } = await admin.from('account_services')
        .update({ deleted_at: new Date().toISOString() }).eq('id', service_id);
      if (error) throw error;

      await logActivity(
        admin, existing.account_id as string, actorId, 'service_removed',
        `Service "${existing.service_name}" removed`, {},
        { service_id }
      );

      return json({ success: true });
    }

    // ─── REQUEST QUOTATION (sugar: build items from existing account_services) ───
    if (action === 'request_quotation') {
      const REQUEST_QUOTATION_ROLES = ['chairman', 'vice_president', 'head_of_operations', 'head_of_marketing', 'sales_lead'];
      if (!roles.some((r: string) => REQUEST_QUOTATION_ROLES.includes(r))) {
        return json({ error: 'Forbidden — insufficient role to request quotations' }, 403);
      }
      const { account_id, service_ids, notes, currency, total_amount } = payload;
      if (!account_id) return json({ error: 'account_id required' }, 400);
      if (!Array.isArray(service_ids) || service_ids.length === 0) {
        return json({ error: 'At least one service_id required' }, 400);
      }

      const { data: acct } = await admin.from('accounts')
        .select('id, name, owner').eq('id', account_id).is('deleted_at', null).single();
      if (!acct) return json({ error: 'Account not found' }, 404);

      const { data: services, error: svcErr } = await admin.from('account_services')
        .select('*').in('id', service_ids).eq('account_id', account_id).is('deleted_at', null);
      if (svcErr) throw svcErr;
      if (!services || services.length === 0) return json({ error: 'No matching services found' }, 404);

      const cur = sanitize(currency, 8) || 'USD';
      const finalTotal = total_amount != null && Number.isFinite(Number(total_amount)) ? Number(total_amount) : null;

      const { data: q, error: insErr } = await admin.from('quotations').insert({
        account_id,
        requested_by: actorId,
        status: 'requested',
        currency: cur,
        total_amount: finalTotal,
        notes: sanitize(notes, 5000) || null,
      }).select().single();
      if (insErr) throw insErr;

      const itemRows = services.map((s, idx: number) => ({
        quotation_id: q.id,
        account_service_id: s.id,
        service_name: s.service_name,
        description: s.description,
        quantity: 1,
        unit_price: null,
        line_total: null,
        sort_order: idx,
      }));
      const { error: itemErr } = await admin.from('quotation_items').insert(itemRows);
      if (itemErr) throw itemErr;

      await admin.from('quotation_activities').insert({
        quotation_id: q.id,
        actor_id: actorId,
        activity_type: 'created',
        title: `Quotation ${q.reference} requested for "${acct.name}"`,
        changes: {},
        metadata: { item_count: services.length, source: 'account_services' },
      });

      // Notify accounting users
      const ACCOUNTING_ROLES_LOCAL = ['head_of_accounting', 'accounting_employee'];
      const { data: acctUsers } = await admin.from('user_roles')
        .select('user_id').in('role', ACCOUNTING_ROLES_LOCAL);
      const accountingIds = Array.from(new Set((acctUsers || []).map((r: { user_id: string }) => r.user_id)));
      const { data: requesterProfile } = await admin.from('profiles')
        .select('display_name').eq('user_id', actorId).maybeSingle();
      const requesterName = requesterProfile?.display_name || 'A user';

      const notif = {
        type: 'quotation_requested',
        title: 'New quotation request',
        body: `${requesterName} requested a quotation for "${acct.name}" (${q.reference})`,
        reference_id: q.id,
        reference_type: 'quotation',
      };
      for (const uid of accountingIds) {
        try {
          await admin.from('notifications').insert({ user_id: uid, ...notif });
          const channel = admin.channel(`user-notify-${uid}`);
          await channel.send({ type: 'broadcast', event: 'new_notification', payload: notif });
          await admin.removeChannel(channel);
        } catch { /* best effort */ }
      }

      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'quotation.created',
        target_type: 'quotation',
        target_id: q.id,
        metadata: { reference: q.reference, account_id, item_count: services.length, source: 'account_services' },
      });

      await logActivity(
        admin, account_id, actorId, 'quotation_requested',
        `Quotation ${q.reference} requested (${services.length} item${services.length === 1 ? '' : 's'})`,
        {}, { quotation_id: q.id, reference: q.reference }
      );

      return json({ quotation: q }, 201);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});

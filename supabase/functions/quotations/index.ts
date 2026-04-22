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

const REQUEST_ROLES = ['chairman', 'vice_president', 'head_of_operations', 'head_of_marketing', 'sales_lead'];
const ACCOUNTING_ROLES = ['head_of_accounting', 'accounting_employee'];
const VIEW_ROLES = [...ACCOUNTING_ROLES, 'chairman', 'vice_president', 'head_of_operations', 'sales_lead'];
const VALID_STATUSES = ['requested', 'in_review', 'sent', 'accepted', 'rejected', 'cancelled'];

type Client = ReturnType<typeof createClient>;

interface QuotationItemInput {
  account_service_id?: string | null;
  service_name: string;
  description?: string | null;
  quantity?: number;
  unit_price?: number | null;
  sort_order?: number;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function sanitize(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen);
}

function csvEscape(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function broadcastNotification(admin: Client, userId: string, notification: { type: string; title: string; body?: string | null; reference_id?: string | null; reference_type?: string | null }) {
  try {
    const channel = admin.channel(`user-notify-${userId}`);
    await channel.send({ type: 'broadcast', event: 'new_notification', payload: notification });
    await admin.removeChannel(channel);
  } catch { /* best effort */ }
}

async function notifyUsers(admin: Client, userIds: string[], notification: { type: string; title: string; body?: string | null; reference_id?: string | null; reference_type?: string | null }) {
  for (const uid of userIds) {
    try {
      await admin.from('notifications').insert({ user_id: uid, ...notification });
      await broadcastNotification(admin, uid, notification);
    } catch { /* best effort */ }
  }
}

async function logActivity(
  admin: Client,
  quotationId: string,
  actorId: string,
  activityType: string,
  title: string,
  changes: Record<string, { old: unknown; new: unknown }> = {},
  metadata: Record<string, unknown> = {}
) {
  await admin.from('quotation_activities').insert({
    quotation_id: quotationId,
    actor_id: actorId,
    activity_type: activityType,
    title,
    changes,
    metadata,
  });
}

function computeTotal(items: QuotationItemInput[]): number {
  return items.reduce((sum, it) => {
    const qty = Number(it.quantity ?? 1);
    const price = Number(it.unit_price ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum;
    return sum + qty * price;
  }, 0);
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
    const isAccounting = roles.some((r: string) => ACCOUNTING_ROLES.includes(r));
    const isAccountingHead = roles.includes('head_of_accounting');
    const canRequest = roles.some((r: string) => REQUEST_ROLES.includes(r));
    const canView = roles.some((r: string) => VIEW_ROLES.includes(r));

    const body = await req.json();
    const { action, ...payload } = body;

    // ─── LIST ───
    if (action === 'list') {
      if (!canView) return json({ error: 'Forbidden' }, 403);
      const f = (payload.filters || {}) as Record<string, unknown>;
      let query = admin.from('quotations').select('*').is('deleted_at', null);

      // Sales_lead/exec without accounting role: only see own requested quotations
      if (!isAccounting && !roles.includes('chairman') && !roles.includes('vice_president') && !roles.includes('head_of_operations')) {
        query = query.eq('requested_by', actorId);
      }

      if (typeof f.status === 'string' && VALID_STATUSES.includes(f.status)) {
        query = query.eq('status', f.status);
      }
      if (typeof f.account_id === 'string' && f.account_id) {
        query = query.eq('account_id', f.account_id);
      }
      if (typeof f.requested_by === 'string' && f.requested_by) {
        query = query.eq('requested_by', f.requested_by);
      }
      if (typeof f.from === 'string' && f.from) {
        query = query.gte('created_at', f.from);
      }
      if (typeof f.to === 'string' && f.to) {
        query = query.lte('created_at', f.to);
      }
      if (typeof f.search === 'string' && f.search.trim()) {
        const s = sanitize(f.search, 100);
        query = query.ilike('reference', `%${s}%`);
      }

      query = query.order('created_at', { ascending: false }).limit(500);
      const { data, error } = await query;
      if (error) throw error;

      const quotations = data || [];
      const accountIds = Array.from(new Set(quotations.map((q: { account_id: string }) => q.account_id).filter(Boolean)));
      const requesterIds = Array.from(new Set(quotations.map((q: { requested_by: string }) => q.requested_by).filter(Boolean)));

      const [accountsRes, profilesRes, itemsRes] = await Promise.all([
        accountIds.length ? admin.from('accounts').select('id, name, email, country_code').in('id', accountIds) : Promise.resolve({ data: [] }),
        requesterIds.length ? admin.from('profiles').select('user_id, display_name, avatar_url, email').in('user_id', requesterIds) : Promise.resolve({ data: [] }),
        quotations.length ? admin.from('quotation_items').select('quotation_id').in('quotation_id', quotations.map((q: { id: string }) => q.id)) : Promise.resolve({ data: [] }),
      ]);

      const accountsMap = new Map((accountsRes.data || []).map((a: { id: string }) => [a.id, a]));
      const profilesMap = new Map((profilesRes.data || []).map((p: { user_id: string }) => [p.user_id, p]));
      const itemCounts = new Map<string, number>();
      for (const it of (itemsRes.data || []) as { quotation_id: string }[]) {
        itemCounts.set(it.quotation_id, (itemCounts.get(it.quotation_id) || 0) + 1);
      }

      const enriched = quotations.map((q: { id: string; account_id: string; requested_by: string }) => ({
        ...q,
        account: accountsMap.get(q.account_id) || null,
        requester: profilesMap.get(q.requested_by) || null,
        item_count: itemCounts.get(q.id) || 0,
      }));

      return json({ quotations: enriched });
    }

    // ─── GET ───
    if (action === 'get') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);

      const { data: q, error } = await admin.from('quotations').select('*').eq('id', id).is('deleted_at', null).single();
      if (error || !q) return json({ error: 'Quotation not found' }, 404);

      // Access check: requester, account owner, or privileged role
      const allowed = q.requested_by === actorId || canView;
      if (!allowed) {
        const { data: acct } = await admin.from('accounts').select('owner').eq('id', q.account_id).single();
        if (!acct || acct.owner !== actorId) return json({ error: 'Forbidden' }, 403);
      }

      const [itemsRes, accountRes, profileRes, activitiesRes] = await Promise.all([
        admin.from('quotation_items').select('*').eq('quotation_id', id).order('sort_order', { ascending: true }),
        admin.from('accounts').select('*').eq('id', q.account_id).single(),
        admin.from('profiles').select('user_id, display_name, avatar_url, email').eq('user_id', q.requested_by).maybeSingle(),
        admin.from('quotation_activities').select('*').eq('quotation_id', id).order('created_at', { ascending: false }).limit(200),
      ]);

      return json({
        quotation: q,
        items: itemsRes.data || [],
        account: accountRes.data || null,
        requester: profileRes.data || null,
        activities: activitiesRes.data || [],
      });
    }

    // ─── CREATE ───
    if (action === 'create') {
      if (!canRequest) return json({ error: 'Forbidden — insufficient role to request quotations' }, 403);
      const { account_id, items, notes, currency, total_amount } = payload;
      if (!account_id) return json({ error: 'account_id required' }, 400);
      if (!Array.isArray(items) || items.length === 0) return json({ error: 'At least one item required' }, 400);

      const { data: acct, error: acctErr } = await admin.from('accounts').select('id, name, owner').eq('id', account_id).is('deleted_at', null).single();
      if (acctErr || !acct) return json({ error: 'Account not found' }, 404);

      const cleanItems: QuotationItemInput[] = items.map((it: QuotationItemInput, idx: number) => ({
        account_service_id: it.account_service_id || null,
        service_name: sanitize(it.service_name, 200),
        description: sanitize(it.description, 1000) || null,
        quantity: Math.max(1, Math.floor(Number(it.quantity ?? 1))),
        unit_price: it.unit_price != null && Number.isFinite(Number(it.unit_price)) ? Number(it.unit_price) : null,
        sort_order: typeof it.sort_order === 'number' ? it.sort_order : idx,
      })).filter((it: QuotationItemInput) => it.service_name);

      if (cleanItems.length === 0) return json({ error: 'At least one valid item required' }, 400);

      const cur = sanitize(currency, 8) || 'USD';
      const computedTotal = computeTotal(cleanItems);
      const finalTotal = total_amount != null && Number.isFinite(Number(total_amount)) ? Number(total_amount) : (computedTotal > 0 ? computedTotal : null);

      const { data: q, error: insErr } = await admin.from('quotations').insert({
        account_id,
        requested_by: actorId,
        status: 'requested',
        currency: cur,
        total_amount: finalTotal,
        notes: sanitize(notes, 5000) || null,
      }).select().single();
      if (insErr) throw insErr;

      const itemRows = cleanItems.map((it, idx) => ({
        quotation_id: q.id,
        account_service_id: it.account_service_id,
        service_name: it.service_name,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.unit_price != null ? it.unit_price * (it.quantity ?? 1) : null,
        sort_order: it.sort_order ?? idx,
      }));
      const { error: itemErr } = await admin.from('quotation_items').insert(itemRows);
      if (itemErr) throw itemErr;

      await logActivity(admin, q.id, actorId, 'created', `Quotation ${q.reference} requested for "${acct.name}"`, {}, { item_count: cleanItems.length, total: finalTotal });

      // Notify accounting users
      const { data: acctUsers } = await admin.from('user_roles').select('user_id').in('role', ACCOUNTING_ROLES);
      const accountingIds = Array.from(new Set((acctUsers || []).map((r: { user_id: string }) => r.user_id)));
      const { data: requesterProfile } = await admin.from('profiles').select('display_name').eq('user_id', actorId).maybeSingle();
      const requesterName = requesterProfile?.display_name || 'A user';

      await notifyUsers(admin, accountingIds, {
        type: 'quotation_requested',
        title: 'New quotation request',
        body: `${requesterName} requested a quotation for "${acct.name}" (${q.reference})`,
        reference_id: q.id,
        reference_type: 'quotation',
      });

      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'quotation.created',
        target_type: 'quotation',
        target_id: q.id,
        metadata: { reference: q.reference, account_id, item_count: cleanItems.length },
      });

      return json({ quotation: q }, 201);
    }

    // ─── UPDATE (accounting only — notes, currency, total) ───
    if (action === 'update') {
      if (!isAccounting) return json({ error: 'Forbidden — accounting only' }, 403);
      const { id, notes, currency, total_amount } = payload;
      if (!id) return json({ error: 'id required' }, 400);

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (notes !== undefined) update.notes = sanitize(notes, 5000) || null;
      if (currency !== undefined) update.currency = sanitize(currency, 8) || 'USD';
      if (total_amount !== undefined) {
        update.total_amount = total_amount != null && Number.isFinite(Number(total_amount)) ? Number(total_amount) : null;
      }

      const { data, error } = await admin.from('quotations').update(update).eq('id', id).is('deleted_at', null).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, 'updated', 'Quotation updated', {}, { fields: Object.keys(update) });
      return json({ quotation: data });
    }

    // ─── UPDATE STATUS (accounting) ───
    if (action === 'update_status') {
      if (!isAccounting) return json({ error: 'Forbidden — accounting only' }, 403);
      const { id, status } = payload;
      if (!id || !VALID_STATUSES.includes(status)) return json({ error: 'Invalid id or status' }, 400);

      const { data: existing } = await admin.from('quotations').select('id, status, requested_by, reference').eq('id', id).is('deleted_at', null).single();
      if (!existing) return json({ error: 'Not found' }, 404);

      const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === 'sent') update.sent_at = new Date().toISOString();
      if (status === 'accepted' || status === 'rejected' || status === 'cancelled') update.decided_at = new Date().toISOString();

      const { error } = await admin.from('quotations').update(update).eq('id', id);
      if (error) throw error;

      await logActivity(admin, id, actorId, 'status_changed', `Status changed to ${status}`, { status: { old: existing.status, new: status } });

      // Notify requester
      await notifyUsers(admin, [existing.requested_by as string], {
        type: 'quotation_status',
        title: `Quotation ${existing.reference} ${status}`,
        body: `Your quotation request was marked as ${status}.`,
        reference_id: id,
        reference_type: 'quotation',
      });

      return json({ success: true });
    }

    // ─── ITEM CRUD (accounting) ───
    if (action === 'add_item') {
      if (!isAccounting) return json({ error: 'Forbidden' }, 403);
      const { quotation_id, service_name, description, quantity, unit_price, account_service_id } = payload;
      if (!quotation_id || !service_name) return json({ error: 'quotation_id and service_name required' }, 400);
      const qty = Math.max(1, Math.floor(Number(quantity ?? 1)));
      const price = unit_price != null && Number.isFinite(Number(unit_price)) ? Number(unit_price) : null;
      const { data, error } = await admin.from('quotation_items').insert({
        quotation_id,
        account_service_id: account_service_id || null,
        service_name: sanitize(service_name, 200),
        description: sanitize(description, 1000) || null,
        quantity: qty,
        unit_price: price,
        line_total: price != null ? price * qty : null,
      }).select().single();
      if (error) throw error;
      await logActivity(admin, quotation_id, actorId, 'item_added', `Item added: ${data.service_name}`);
      return json({ item: data }, 201);
    }

    if (action === 'update_item') {
      if (!isAccounting) return json({ error: 'Forbidden' }, 403);
      const { item_id, service_name, description, quantity, unit_price } = payload;
      if (!item_id) return json({ error: 'item_id required' }, 400);
      const update: Record<string, unknown> = {};
      if (service_name !== undefined) update.service_name = sanitize(service_name, 200);
      if (description !== undefined) update.description = sanitize(description, 1000) || null;
      if (quantity !== undefined) update.quantity = Math.max(1, Math.floor(Number(quantity)));
      if (unit_price !== undefined) update.unit_price = unit_price != null && Number.isFinite(Number(unit_price)) ? Number(unit_price) : null;
      if (update.unit_price !== undefined || update.quantity !== undefined) {
        const { data: cur } = await admin.from('quotation_items').select('quantity, unit_price').eq('id', item_id).single();
        const q = (update.quantity as number) ?? cur?.quantity ?? 1;
        const p = (update.unit_price as number | null) ?? cur?.unit_price ?? null;
        update.line_total = p != null ? p * q : null;
      }
      const { data, error } = await admin.from('quotation_items').update(update).eq('id', item_id).select().single();
      if (error) throw error;
      await logActivity(admin, data.quotation_id as string, actorId, 'item_updated', `Item updated: ${data.service_name}`);
      return json({ item: data });
    }

    if (action === 'remove_item') {
      if (!isAccounting) return json({ error: 'Forbidden' }, 403);
      const { item_id } = payload;
      if (!item_id) return json({ error: 'item_id required' }, 400);
      const { data: existing } = await admin.from('quotation_items').select('quotation_id, service_name').eq('id', item_id).single();
      if (!existing) return json({ error: 'Item not found' }, 404);
      const { error } = await admin.from('quotation_items').delete().eq('id', item_id);
      if (error) throw error;
      await logActivity(admin, existing.quotation_id as string, actorId, 'item_removed', `Item removed: ${existing.service_name}`);
      return json({ success: true });
    }

    // ─── DELETE (head_of_accounting only, soft) ───
    if (action === 'delete') {
      if (!isAccountingHead) return json({ error: 'Forbidden — head_of_accounting only' }, 403);
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { error } = await admin.from('quotations').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      await admin.from('audit_logs').insert({
        actor_id: actorId,
        action: 'quotation.deleted',
        target_type: 'quotation',
        target_id: id,
      });
      return json({ success: true });
    }

    // ─── EXPORT CSV ───
    if (action === 'export_csv') {
      if (!canView) return json({ error: 'Forbidden' }, 403);
      const ids = Array.isArray(payload.ids) ? payload.ids.filter((x: unknown) => typeof x === 'string') : null;
      let query = admin.from('quotations').select('*').is('deleted_at', null);
      if (ids && ids.length > 0) query = query.in('id', ids);
      if (!isAccounting && !roles.includes('chairman') && !roles.includes('vice_president') && !roles.includes('head_of_operations')) {
        query = query.eq('requested_by', actorId);
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;

      const rows = data || [];
      const accountIds = Array.from(new Set(rows.map((r: { account_id: string }) => r.account_id).filter(Boolean)));
      const requesterIds = Array.from(new Set(rows.map((r: { requested_by: string }) => r.requested_by).filter(Boolean)));
      const [accountsRes, profilesRes] = await Promise.all([
        accountIds.length ? admin.from('accounts').select('id, name').in('id', accountIds) : Promise.resolve({ data: [] }),
        requesterIds.length ? admin.from('profiles').select('user_id, display_name, email').in('user_id', requesterIds) : Promise.resolve({ data: [] }),
      ]);
      const accountsMap = new Map((accountsRes.data || []).map((a: { id: string; name: string }) => [a.id, a]));
      const profilesMap = new Map((profilesRes.data || []).map((p: { user_id: string }) => [p.user_id, p]));

      const header = ['Reference', 'Account', 'Requested By', 'Status', 'Currency', 'Total', 'Created', 'Updated', 'Sent At', 'Decided At', 'Notes'];
      const lines = [header.join(',')];
      for (const r of rows as Array<{ reference: string; account_id: string; requested_by: string; status: string; currency: string; total_amount: number | null; created_at: string; updated_at: string; sent_at: string | null; decided_at: string | null; notes: string | null }>) {
        const acct = accountsMap.get(r.account_id) as { name?: string } | undefined;
        const req = profilesMap.get(r.requested_by) as { display_name?: string; email?: string } | undefined;
        lines.push([
          csvEscape(r.reference),
          csvEscape(acct?.name ?? ''),
          csvEscape(req?.display_name ?? req?.email ?? r.requested_by),
          csvEscape(r.status),
          csvEscape(r.currency),
          csvEscape(r.total_amount ?? ''),
          csvEscape(r.created_at),
          csvEscape(r.updated_at),
          csvEscape(r.sent_at ?? ''),
          csvEscape(r.decided_at ?? ''),
          csvEscape(r.notes ?? ''),
        ].join(','));
      }
      return json({ csv: lines.join('\n'), count: rows.length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('quotations error:', err);
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});

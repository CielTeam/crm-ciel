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

// ─── Helpers ───

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_ROLES = ['chairman', 'vice_president', 'head_of_operations'];
const VALID_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
const VALID_LOST_REASONS = ['competitor', 'price_issue', 'no_response', 'timing', 'budget', 'invalid', 'duplicate', 'deprioritized', 'other'] as const;

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

// ─── Lead Scoring (authoritative, server-side) ───
// Mirrors the legacy client-side computeLeadScore but is the source of truth.
interface ScoringInput {
  stage?: string | null;
  estimated_value?: number | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  industry?: string | null;
  last_contacted_at?: string | null;
  probability_percent?: number | null;
  services_count?: number;
}
function computeScore(lead: ScoringInput): { score: number; band: 'hot' | 'warm' | 'cold' } {
  let score = 0;
  const stageOrder = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];
  const stageIdx = stageOrder.indexOf(lead.stage || '');
  if (stageIdx >= 0) score += stageIdx * 10;
  if (lead.stage === 'won') score += 20;
  if (lead.estimated_value && lead.estimated_value > 0) score += 15;
  if (lead.estimated_value && lead.estimated_value > 10000) score += 10;
  if (lead.contact_email) score += 5;
  if (lead.contact_phone) score += 5;
  if (lead.website) score += 3;
  if (lead.industry) score += 2;
  if (lead.last_contacted_at) {
    const daysSince = (Date.now() - new Date(lead.last_contacted_at).getTime()) / 86400000;
    if (daysSince < 3) score += 15;
    else if (daysSince < 7) score += 10;
    else if (daysSince < 14) score += 5;
  }
  if (lead.services_count && lead.services_count > 0) score += Math.min(lead.services_count * 3, 15);
  score += Math.floor((lead.probability_percent || 0) / 10);
  const band = score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cold';
  return { score: Math.min(100, score), band };
}

async function recomputeAndSaveScore(
  admin: ReturnType<typeof createClient>,
  leadId: string,
): Promise<{ score: number; band: string } | null> {
  const { data: lead } = await admin.from('leads').select('stage,estimated_value,contact_email,contact_phone,website,industry,last_contacted_at,probability_percent').eq('id', leadId).single();
  if (!lead) return null;
  const { count } = await admin.from('lead_services').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).is('deleted_at', null);
  const { score, band } = computeScore({ ...lead, services_count: count || 0 } as ScoringInput);
  await admin.from('leads').update({ score, score_band: band, score_updated_at: new Date().toISOString() }).eq('id', leadId);
  return { score, band };
}

// Get team-scoped user IDs for head_of_operations
async function getScopedUserIds(admin: ReturnType<typeof createClient>, actorId: string): Promise<string[] | null> {
  // null = global access (chairman/VP), string[] = scoped to these user IDs
  const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', actorId);
  const roles = (roleRows || []).map((r: { role: string }) => r.role);
  
  if (roles.includes('chairman') || roles.includes('vice_president')) return null; // global
  if (!roles.includes('head_of_operations')) return []; // no access
  
  // Get all team members from actor's teams
  const { data: myTeams } = await admin.from('team_members').select('team_id').eq('user_id', actorId);
  if (!myTeams || myTeams.length === 0) return [actorId]; // only own leads
  
  const teamIds = myTeams.map((t: { team_id: string }) => t.team_id);
  const { data: members } = await admin.from('team_members').select('user_id').in('team_id', teamIds);
  const userIds = [...new Set([actorId, ...(members || []).map((m: { user_id: string }) => m.user_id)])];
  return userIds;
}

function filterLeadsByScope(leads: Record<string, unknown>[], scopedIds: string[] | null): Record<string, unknown>[] {
  if (scopedIds === null) return leads; // global access
  return leads.filter(l => {
    const assignedTo = l.assigned_to as string | null;
    return assignedTo === null || scopedIds.includes(assignedTo);
  });
}

async function logActivity(
  admin: ReturnType<typeof createClient>,
  leadId: string,
  actorId: string,
  activityType: string,
  title: string,
  changes: Record<string, { old: unknown; new: unknown }> = {},
  metadata: Record<string, unknown> = {}
) {
  await admin.from('lead_activities').insert({
    lead_id: leadId,
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

    // Verify role
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', actorId);
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r: string) => ALLOWED_ROLES.includes(r))) {
      return json({ error: 'Forbidden — insufficient role' }, 403);
    }

    const scopedIds = await getScopedUserIds(admin, actorId);

    const body = await req.json();
    const { action, ...payload } = body;

    // ─── LIST ───
    if (action === 'list') {
      let query = admin.from('leads').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (payload.status) query = query.eq('status', payload.status);
      if (payload.stage) query = query.eq('stage', payload.stage);
      const { data, error } = await query;
      if (error) throw error;
      return json({ leads: filterLeadsByScope(data || [], scopedIds) });
    }

    // ─── LIST WITH SERVICES ───
    if (action === 'list_with_services') {
      let query = admin.from('leads').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (payload.status) query = query.eq('status', payload.status);
      if (payload.stage) query = query.eq('stage', payload.stage);
      const { data: leads, error } = await query;
      if (error) throw error;

      const filteredLeads = filterLeadsByScope(leads || [], scopedIds);
      const leadIds = filteredLeads.map((l: Record<string, unknown>) => l.id as string);
      let services: Record<string, unknown>[] = [];
      if (leadIds.length > 0) {
        const { data: svcData } = await admin.from('lead_services').select('*')
          .in('lead_id', leadIds).is('deleted_at', null).order('expiry_date', { ascending: true });
        services = svcData || [];
      }

      const serviceMap: Record<string, Record<string, unknown>[]> = {};
      for (const s of services) {
        const lid = s.lead_id as string;
        if (!serviceMap[lid]) serviceMap[lid] = [];
        serviceMap[lid].push(s);
      }

      const enriched = filteredLeads.map((l: Record<string, unknown>) => ({
        ...l,
        services: serviceMap[l.id as string] || [],
      }));

      return json({ leads: enriched });
    }

    // ─── STATS ───
    if (action === 'stats') {
      // Get all leads for scope filtering
      const { data: allLeads } = await admin.from('leads').select('id,stage,status,estimated_value,probability_percent,weighted_forecast,next_follow_up_at,assigned_to').is('deleted_at', null);
      const leads = filterLeadsByScope(allLeads || [], scopedIds);
      
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

      // Stage counts
      const stageCounts: Record<string, number> = {};
      for (const s of VALID_STAGES) stageCounts[s] = 0;
      let pipelineValue = 0;
      let weightedForecast = 0;
      let overdueFollowUps = 0;

      for (const l of leads) {
        const stage = l.stage as string;
        if (stageCounts[stage] !== undefined) stageCounts[stage]++;
        pipelineValue += Number(l.estimated_value || 0);
        weightedForecast += Number(l.weighted_forecast || 0);
        const followUp = l.next_follow_up_at as string | null;
        if (followUp && new Date(followUp) < now) overdueFollowUps++;
      }

      // Service stats (scoped to visible leads)
      const leadIds = leads.map(l => l.id as string);
      let totalServices = 0;
      let expiring30 = 0;
      let expiring7 = 0;

      if (leadIds.length > 0) {
        const { count: ts } = await admin.from('lead_services').select('*', { count: 'exact', head: true })
          .in('lead_id', leadIds).is('deleted_at', null).eq('status', 'active');
        totalServices = ts || 0;

        const { count: e30 } = await admin.from('lead_services').select('*', { count: 'exact', head: true })
          .in('lead_id', leadIds).is('deleted_at', null).eq('status', 'active').lte('expiry_date', in30).gte('expiry_date', todayStr);
        expiring30 = e30 || 0;

        const { count: e7 } = await admin.from('lead_services').select('*', { count: 'exact', head: true })
          .in('lead_id', leadIds).is('deleted_at', null).eq('status', 'active').lte('expiry_date', in7).gte('expiry_date', todayStr);
        expiring7 = e7 || 0;
      }

      return json({
        stats: {
          total: leads.length,
          active: stageCounts['won'] || 0,
          potential: stageCounts['new'] || 0,
          total_services: totalServices,
          expiring_30: expiring30,
          expiring_7: expiring7,
          lost: stageCounts['lost'] || 0,
          stage_counts: stageCounts,
          pipeline_value: pipelineValue,
          weighted_forecast: weightedForecast,
          overdue_follow_ups: overdueFollowUps,
          qualified: stageCounts['qualified'] || 0,
          won: stageCounts['won'] || 0,
        }
      });
    }

    // ─── GET ───
    if (action === 'get') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const { data, error } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (error) throw error;
      // Check scope
      if (scopedIds !== null && data.assigned_to && !scopedIds.includes(data.assigned_to)) {
        return json({ error: 'Forbidden' }, 403);
      }
      const { data: services } = await admin.from('lead_services').select('*').eq('lead_id', id).is('deleted_at', null).order('expiry_date', { ascending: true });
      return json({ lead: { ...data, services: services || [] } });
    }

    // ─── CREATE ───
    if (action === 'create') {
      const company_name = sanitize(payload.company_name, 255);
      const contact_name = sanitize(payload.contact_name, 255);
      if (!company_name || !contact_name) return json({ error: 'company_name and contact_name required' }, 400);

      const stage = VALID_STAGES.includes(payload.stage) ? payload.stage : 'new';
      
      const insertData: Record<string, unknown> = {
        company_name,
        contact_name,
        contact_email: sanitize(payload.contact_email, 255) || null,
        contact_phone: sanitize(payload.contact_phone, 50) || null,
        status: ['potential', 'active', 'inactive', 'lost'].includes(payload.status) ? payload.status : 'potential',
        source: sanitize(payload.source, 255) || null,
        notes: sanitize(payload.notes, 5000) || null,
        created_by: actorId,
        assigned_to: payload.assigned_to || null,
        stage,
        estimated_value: payload.estimated_value != null ? Number(payload.estimated_value) : null,
        currency: sanitize(payload.currency, 10) || 'USD',
        probability_percent: Math.min(100, Math.max(0, Number(payload.probability_percent) || 0)),
        expected_close_date: payload.expected_close_date || null,
        next_follow_up_at: payload.next_follow_up_at || null,
        industry: sanitize(payload.industry, 255) || null,
        website: sanitize(payload.website, 500) || null,
        secondary_phone: sanitize(payload.secondary_phone, 50) || null,
        city: sanitize(payload.city, 255) || null,
        country: sanitize(payload.country, 255) || null,
        country_code: isValidCountryCode(payload.country_code) ? payload.country_code : null,
        country_name: sanitize(payload.country_name, 255) || null,
        state_province: sanitize(payload.state_province, 255) || null,
        tags: Array.isArray(payload.tags) ? payload.tags.map((t: unknown) => sanitize(t, 100)).filter(Boolean) : [],
        assigned_by: payload.assigned_to ? actorId : null,
        assigned_at: payload.assigned_to ? new Date().toISOString() : null,
      };

      const { data, error } = await admin.from('leads').insert(insertData).select().single();
      if (error) throw error;

      await logActivity(admin, data.id, actorId, 'created', `Lead "${company_name}" created`);
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'lead.create', target_type: 'lead', target_id: data.id, metadata: { company_name } });

      const scored = await recomputeAndSaveScore(admin, data.id);
      return json({ lead: { ...data, ...(scored || {}) } }, 201);
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, ...updates } = payload;
      if (!id) return json({ error: 'id required' }, 400);

      // Get current lead for change tracking
      const { data: current } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!current) return json({ error: 'Lead not found' }, 404);
      if (scopedIds !== null && current.assigned_to && !scopedIds.includes(current.assigned_to)) {
        return json({ error: 'Forbidden' }, 403);
      }

      const fields: Record<string, unknown> = {};
      const changes: Record<string, { old: unknown; new: unknown }> = {};

      const trackField = (key: string, newVal: unknown, oldVal: unknown) => {
        if (newVal !== undefined && newVal !== oldVal) {
          fields[key] = newVal;
          changes[key] = { old: oldVal, new: newVal };
        }
      };

      if (updates.company_name !== undefined) trackField('company_name', sanitize(updates.company_name, 255), current.company_name);
      if (updates.contact_name !== undefined) trackField('contact_name', sanitize(updates.contact_name, 255), current.contact_name);
      if (updates.contact_email !== undefined) trackField('contact_email', sanitize(updates.contact_email, 255) || null, current.contact_email);
      if (updates.contact_phone !== undefined) trackField('contact_phone', sanitize(updates.contact_phone, 50) || null, current.contact_phone);
      if (updates.status !== undefined && ['potential', 'active', 'inactive', 'lost'].includes(updates.status)) trackField('status', updates.status, current.status);
      if (updates.source !== undefined) trackField('source', sanitize(updates.source, 255) || null, current.source);
      if (updates.notes !== undefined) trackField('notes', sanitize(updates.notes, 5000) || null, current.notes);
      if (updates.stage !== undefined && VALID_STAGES.includes(updates.stage)) trackField('stage', updates.stage, current.stage);
      if (updates.estimated_value !== undefined) trackField('estimated_value', updates.estimated_value != null ? Number(updates.estimated_value) : null, current.estimated_value);
      if (updates.currency !== undefined) trackField('currency', sanitize(updates.currency, 10) || 'USD', current.currency);
      if (updates.probability_percent !== undefined) trackField('probability_percent', Math.min(100, Math.max(0, Number(updates.probability_percent) || 0)), current.probability_percent);
      if (updates.expected_close_date !== undefined) trackField('expected_close_date', updates.expected_close_date || null, current.expected_close_date);
      if (updates.next_follow_up_at !== undefined) trackField('next_follow_up_at', updates.next_follow_up_at || null, current.next_follow_up_at);
      if (updates.last_contacted_at !== undefined) trackField('last_contacted_at', updates.last_contacted_at || null, current.last_contacted_at);
      if (updates.industry !== undefined) trackField('industry', sanitize(updates.industry, 255) || null, current.industry);
      if (updates.website !== undefined) trackField('website', sanitize(updates.website, 500) || null, current.website);
      if (updates.secondary_phone !== undefined) trackField('secondary_phone', sanitize(updates.secondary_phone, 50) || null, current.secondary_phone);
      if (updates.city !== undefined) trackField('city', sanitize(updates.city, 255) || null, current.city);
      if (updates.country !== undefined) trackField('country', sanitize(updates.country, 255) || null, current.country);
      if (updates.country_code !== undefined) trackField('country_code', isValidCountryCode(updates.country_code) ? updates.country_code : null, current.country_code);
      if (updates.country_name !== undefined) trackField('country_name', sanitize(updates.country_name, 255) || null, current.country_name);
      if (updates.state_province !== undefined) trackField('state_province', sanitize(updates.state_province, 255) || null, current.state_province);
      if (updates.tags !== undefined) trackField('tags', Array.isArray(updates.tags) ? updates.tags.map((t: unknown) => sanitize(t, 100)).filter(Boolean) : [], current.tags);

      if (updates.assigned_to !== undefined && updates.assigned_to !== current.assigned_to) {
        trackField('assigned_to', updates.assigned_to || null, current.assigned_to);
        fields.assigned_by = actorId;
        fields.assigned_at = new Date().toISOString();
      }

      if (Object.keys(fields).length === 0) return json({ lead: current });

      const { data, error } = await admin.from('leads').update(fields).eq('id', id).is('deleted_at', null).select().single();
      if (error) throw error;

      if (Object.keys(changes).length > 0) {
        await logActivity(admin, id, actorId, 'updated', 'Lead updated', changes);
      }
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'lead.update', target_type: 'lead', target_id: id, metadata: changes });

      const scoringKeys = ['stage', 'estimated_value', 'contact_email', 'contact_phone', 'website', 'industry', 'probability_percent', 'last_contacted_at'];
      if (scoringKeys.some(k => k in fields)) {
        const scored = await recomputeAndSaveScore(admin, id);
        if (scored) Object.assign(data, scored);
      }

      return json({ lead: data });
    }

    // ─── CHANGE STAGE ───
    if (action === 'change_stage') {
      const { id, stage, lost_reason_code, lost_notes: lostNotesVal } = payload;
      if (!id || !stage) return json({ error: 'id and stage required' }, 400);
      if (!VALID_STAGES.includes(stage)) return json({ error: 'Invalid stage' }, 400);

      const { data: current } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!current) return json({ error: 'Lead not found' }, 404);
      if (scopedIds !== null && current.assigned_to && !scopedIds.includes(current.assigned_to)) {
        return json({ error: 'Forbidden' }, 403);
      }

      if (stage === 'lost' && !lost_reason_code) return json({ error: 'lost_reason_code required when marking as lost' }, 400);
      if (stage === 'lost' && !VALID_LOST_REASONS.includes(lost_reason_code)) return json({ error: 'Invalid lost_reason_code' }, 400);

      const updateFields: Record<string, unknown> = { stage };
      if (stage === 'lost') {
        updateFields.lost_reason_code = lost_reason_code;
        updateFields.lost_notes = sanitize(lostNotesVal, 2000) || null;
      }

      const { data, error } = await admin.from('leads').update(updateFields).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, 'stage_change', `Stage changed to ${stage}`, {
        stage: { old: current.stage, new: stage },
        ...(stage === 'lost' ? { lost_reason_code: { old: current.lost_reason_code, new: lost_reason_code } } : {}),
      });

      const scored = await recomputeAndSaveScore(admin, id);
      if (scored) Object.assign(data, scored);

      return json({ lead: data });
    }

    // ─── ASSIGN OWNER ───
    if (action === 'assign_owner') {
      const { id, assigned_to } = payload;
      if (!id) return json({ error: 'id required' }, 400);

      const { data: current } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!current) return json({ error: 'Lead not found' }, 404);

      const { data, error } = await admin.from('leads').update({
        assigned_to: assigned_to || null,
        assigned_by: actorId,
        assigned_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, 'owner_change', 'Owner changed', {
        assigned_to: { old: current.assigned_to, new: assigned_to || null },
      });

      return json({ lead: data });
    }

    // ─── MARK LOST ───
    if (action === 'mark_lost') {
      const { id, lost_reason_code, lost_notes: lostNotesVal } = payload;
      if (!id || !lost_reason_code) return json({ error: 'id and lost_reason_code required' }, 400);
      if (!VALID_LOST_REASONS.includes(lost_reason_code)) return json({ error: 'Invalid lost_reason_code' }, 400);

      const { data: current } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!current) return json({ error: 'Lead not found' }, 404);

      const { data, error } = await admin.from('leads').update({
        stage: 'lost',
        lost_reason_code,
        lost_notes: sanitize(lostNotesVal, 2000) || null,
      }).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, 'lost', `Lead marked as lost: ${lost_reason_code}`, {
        stage: { old: current.stage, new: 'lost' },
        lost_reason_code: { old: current.lost_reason_code, new: lost_reason_code },
      });

      return json({ lead: data });
    }

    // ─── REOPEN ───
    if (action === 'reopen') {
      const { id, stage } = payload;
      if (!id) return json({ error: 'id required' }, 400);
      const newStage = VALID_STAGES.includes(stage) && stage !== 'lost' ? stage : 'new';

      const { data: current } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!current) return json({ error: 'Lead not found' }, 404);

      const { data, error } = await admin.from('leads').update({
        stage: newStage,
        lost_reason_code: null,
        lost_notes: null,
      }).eq('id', id).select().single();
      if (error) throw error;

      await logActivity(admin, id, actorId, 'reopened', `Lead reopened to ${newStage}`, {
        stage: { old: current.stage, new: newStage },
      });

      return json({ lead: data });
    }

    // ─── ADD NOTE ───
    if (action === 'add_note') {
      const { lead_id, note_type, content, outcome, next_step, contact_date, duration_minutes } = payload;
      if (!lead_id || !content) return json({ error: 'lead_id and content required' }, 400);
      const validNoteTypes = ['general', 'call_log', 'email_log', 'meeting_log', 'follow_up'];
      const type = validNoteTypes.includes(note_type) ? note_type : 'general';

      const { data, error } = await admin.from('lead_notes').insert({
        lead_id,
        author_id: actorId,
        note_type: type,
        content: sanitize(content, 5000),
        outcome: sanitize(outcome, 500) || null,
        next_step: sanitize(next_step, 500) || null,
        contact_date: contact_date || null,
        duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      }).select().single();
      if (error) throw error;

      // Update last_contacted_at for interaction types
      if (['call_log', 'email_log', 'meeting_log'].includes(type)) {
        await admin.from('leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', lead_id);
      }

      await logActivity(admin, lead_id, actorId, 'note_added', `${type.replace('_', ' ')} added`, {}, { note_id: data.id, note_type: type });

      return json({ note: data }, 201);
    }

    // ─── LIST ACTIVITIES ───
    if (action === 'list_activities') {
      const { lead_id } = payload;
      if (!lead_id) return json({ error: 'lead_id required' }, 400);
      const { data, error } = await admin.from('lead_activities').select('*').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json({ activities: data || [] });
    }

    // ─── LIST NOTES ───
    if (action === 'list_notes') {
      const { lead_id } = payload;
      if (!lead_id) return json({ error: 'lead_id required' }, 400);
      const { data, error } = await admin.from('lead_notes').select('*').eq('lead_id', lead_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return json({ notes: data || [] });
    }

    // ─── CHECK DUPLICATES ───
    if (action === 'check_duplicates') {
      const { company_name, email, phone, exclude_id } = payload;
      const conditions: string[] = [];
      const results: Record<string, unknown>[] = [];

      if (company_name) {
        const normalized = company_name.toLowerCase().trim().replace(/\s+/g, ' ');
        const { data } = await admin.from('leads').select('id,company_name,contact_email,contact_phone,stage')
          .is('deleted_at', null).ilike('normalized_company', `%${normalized}%`).limit(5);
        if (data) results.push(...data.filter((d: Record<string, unknown>) => d.id !== exclude_id));
      }
      if (email) {
        const normalized = email.toLowerCase().trim();
        const { data } = await admin.from('leads').select('id,company_name,contact_email,contact_phone,stage')
          .is('deleted_at', null).eq('normalized_email', normalized).limit(5);
        if (data) results.push(...data.filter((d: Record<string, unknown>) => d.id !== exclude_id));
      }
      if (phone) {
        const normalized = phone.replace(/[^0-9+]/g, '');
        if (normalized.length >= 6) {
          const { data } = await admin.from('leads').select('id,company_name,contact_email,contact_phone,stage')
            .is('deleted_at', null).eq('normalized_phone', normalized).limit(5);
          if (data) results.push(...data.filter((d: Record<string, unknown>) => d.id !== exclude_id));
        }
      }

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = results.filter(r => {
        const id = r.id as string;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      return json({ duplicates: unique });
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

      await logActivity(admin, payload.lead_id, actorId, 'service_added', `Service "${service_name}" added`, {}, { service_id: data.id });

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

    // ─── BULK STAGE CHANGE ───
    if (action === 'bulk_change_stage') {
      const { ids, stage, lost_reason_code, lost_notes: lostNotesVal } = payload;
      if (!Array.isArray(ids) || ids.length === 0 || !stage) return json({ error: 'ids array and stage required' }, 400);
      if (!VALID_STAGES.includes(stage)) return json({ error: 'Invalid stage' }, 400);
      if (stage === 'lost' && !lost_reason_code) return json({ error: 'lost_reason_code required' }, 400);
      if (stage === 'lost' && !VALID_LOST_REASONS.includes(lost_reason_code)) return json({ error: 'Invalid lost_reason_code' }, 400);
      if (ids.length > 100) return json({ error: 'Max 100 leads per bulk action' }, 400);

      const updateFields: Record<string, unknown> = { stage };
      if (stage === 'lost') {
        updateFields.lost_reason_code = lost_reason_code;
        updateFields.lost_notes = sanitize(lostNotesVal, 2000) || null;
      }

      const { data, error } = await admin.from('leads').update(updateFields).in('id', ids).is('deleted_at', null).select();
      if (error) throw error;

      for (const lead of (data || [])) {
        await logActivity(admin, lead.id, actorId, 'stage_change', `Bulk stage change to ${stage}`, { stage: { old: 'bulk', new: stage } });
      }

      return json({ updated: (data || []).length });
    }

    // ─── BULK ASSIGN OWNER ───
    if (action === 'bulk_assign_owner') {
      const { ids, assigned_to } = payload;
      if (!Array.isArray(ids) || ids.length === 0) return json({ error: 'ids array required' }, 400);
      if (ids.length > 100) return json({ error: 'Max 100 leads per bulk action' }, 400);

      const { data, error } = await admin.from('leads').update({
        assigned_to: assigned_to || null,
        assigned_by: actorId,
        assigned_at: new Date().toISOString(),
      }).in('id', ids).is('deleted_at', null).select();
      if (error) throw error;

      for (const lead of (data || [])) {
        await logActivity(admin, lead.id, actorId, 'owner_change', 'Bulk owner assignment', { assigned_to: { old: 'bulk', new: assigned_to || null } });
      }

      return json({ updated: (data || []).length });
    }

    // ─── BULK DELETE ───
    if (action === 'bulk_delete') {
      const { ids } = payload;
      if (!Array.isArray(ids) || ids.length === 0) return json({ error: 'ids array required' }, 400);
      if (ids.length > 100) return json({ error: 'Max 100 leads per bulk action' }, 400);

      const { error } = await admin.from('leads').update({ deleted_at: new Date().toISOString() }).in('id', ids);
      if (error) throw error;

      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'lead.bulk_delete', target_type: 'lead', metadata: { ids } });

      return json({ deleted: ids.length });
    }

    // ─── CONVERT LEAD ───
    if (action === 'convert') {
      const { id, account_name, contact_first_name, contact_last_name, opportunity_name } = payload;
      if (!id) return json({ error: 'id required' }, 400);

      const { data: lead } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!lead) return json({ error: 'Lead not found' }, 404);
      if (lead.stage !== 'won') return json({ error: 'Only won leads can be converted' }, 400);
      if (lead.converted_at) return json({ error: 'Lead already converted' }, 400);
      if (scopedIds !== null && lead.assigned_to && !scopedIds.includes(lead.assigned_to)) {
        return json({ error: 'Forbidden' }, 403);
      }

      const owner = lead.assigned_to || actorId;

      // 1. Create Account
      const acctName = sanitize(account_name || lead.company_name, 255);
      const { data: account, error: acctErr } = await admin.from('accounts').insert({
        name: acctName,
        industry: lead.industry,
        website: lead.website,
        city: lead.city,
        country: lead.country,
        phone: lead.contact_phone,
        email: lead.contact_email,
        notes: lead.notes,
        owner,
        source_lead_id: id,
        tags: lead.tags || [],
        created_by: actorId,
      }).select().single();
      if (acctErr) throw acctErr;

      // 2. Create Contact
      const nameParts = (lead.contact_name || '').trim().split(/\s+/);
      const firstName = sanitize(contact_first_name || nameParts[0] || '', 255);
      const lastName = sanitize(contact_last_name || nameParts.slice(1).join(' ') || '', 255);
      const { data: contact, error: ctErr } = await admin.from('contacts').insert({
        account_id: account.id,
        first_name: firstName || 'Unknown',
        last_name: lastName || 'Unknown',
        email: lead.contact_email,
        phone: lead.contact_phone,
        secondary_phone: lead.secondary_phone,
        owner,
        source_lead_id: id,
        created_by: actorId,
      }).select().single();
      if (ctErr) throw ctErr;

      // 3. Create Opportunity
      const oppName = sanitize(opportunity_name || `${acctName} - Opportunity`, 255);
      const { data: opportunity, error: oppErr } = await admin.from('opportunities').insert({
        account_id: account.id,
        contact_id: contact.id,
        name: oppName,
        stage: 'won',
        estimated_value: lead.estimated_value,
        currency: lead.currency || 'USD',
        probability_percent: lead.probability_percent || 100,
        expected_close_date: lead.expected_close_date,
        won_at: new Date().toISOString(),
        notes: lead.notes,
        owner,
        source_lead_id: id,
        created_by: actorId,
      }).select().single();
      if (oppErr) throw oppErr;

      // 4. Update lead with conversion metadata
      await admin.from('leads').update({
        converted_at: new Date().toISOString(),
        converted_to_type: 'account',
        converted_to_id: account.id,
      }).eq('id', id);

      // 5. Audit trail
      await logActivity(admin, id, actorId, 'converted', `Lead converted to Account "${acctName}"`, {
        converted_to_type: { old: null, new: 'account' },
        account_id: { old: null, new: account.id },
        contact_id: { old: null, new: contact.id },
        opportunity_id: { old: null, new: opportunity.id },
      });
      await admin.from('audit_logs').insert({
        actor_id: actorId, action: 'lead.convert', target_type: 'lead', target_id: id,
        metadata: { account_id: account.id, contact_id: contact.id, opportunity_id: opportunity.id },
      });

      return json({ account, contact, opportunity });
    }

    // ─── UNCONVERT LEAD ───
    if (action === 'unconvert') {
      const { id } = payload;
      if (!id) return json({ error: 'id required' }, 400);

      const { data: lead } = await admin.from('leads').select('*').eq('id', id).is('deleted_at', null).single();
      if (!lead) return json({ error: 'Lead not found' }, 404);
      if (!lead.converted_at) return json({ error: 'Lead is not converted' }, 400);
      if (scopedIds !== null && lead.assigned_to && !scopedIds.includes(lead.assigned_to)) {
        return json({ error: 'Forbidden' }, 403);
      }

      const accountId = lead.converted_to_id;

      // Soft-delete created entities
      if (accountId) {
        await admin.from('opportunities').update({ deleted_at: new Date().toISOString() }).eq('source_lead_id', id);
        await admin.from('contacts').update({ deleted_at: new Date().toISOString() }).eq('source_lead_id', id);
        await admin.from('accounts').update({ deleted_at: new Date().toISOString() }).eq('id', accountId);
      }

      // Clear conversion metadata
      await admin.from('leads').update({
        converted_at: null,
        converted_to_type: null,
        converted_to_id: null,
      }).eq('id', id);

      await logActivity(admin, id, actorId, 'unconverted', 'Lead conversion reversed', {
        converted_to_type: { old: lead.converted_to_type, new: null },
        converted_to_id: { old: lead.converted_to_id, new: null },
      });
      await admin.from('audit_logs').insert({
        actor_id: actorId, action: 'lead.unconvert', target_type: 'lead', target_id: id,
        metadata: { reversed_account_id: accountId },
      });

      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('leads error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

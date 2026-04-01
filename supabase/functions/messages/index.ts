import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

// ─── Edge Function ───

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let actorId: string;
  try {
    actorId = await verifyAuth0Jwt(req);
  } catch (err) {
    // Log auth failure
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'messages', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, ...payload } = body;

    // LIST CONVERSATIONS — rate limit: 30/60s
    if (action === 'list_conversations') {
      if (!checkRateLimit(`msg:${actorId}`, 30, 60_000)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: memberships, error: mErr } = await admin
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', actorId);

      if (mErr) throw mErr;
      if (!memberships || memberships.length === 0) {
        return new Response(JSON.stringify({ conversations: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const convIds = memberships.map(m => m.conversation_id);
      const readMap = new Map(memberships.map(m => [m.conversation_id, m.last_read_at]));

      const { data: convs, error: cErr } = await admin
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .order('updated_at', { ascending: false });

      if (cErr) throw cErr;

      const { data: allMembers } = await admin
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', convIds);

      const results = [];
      for (const conv of convs || []) {
        const { data: lastMsg } = await admin
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const lastRead = readMap.get(conv.id);
        let unreadCount = 0;
        if (lastRead) {
          const { count } = await admin
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .is('deleted_at', null)
            .neq('sender_id', actorId)
            .gt('created_at', lastRead);
          unreadCount = count || 0;
        }

        const members = (allMembers || [])
          .filter(m => m.conversation_id === conv.id)
          .map(m => m.user_id);

        results.push({
          ...conv,
          lastMessage: lastMsg?.[0] || null,
          unreadCount,
          memberIds: members,
        });
      }

      return new Response(JSON.stringify({ conversations: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET MESSAGES
    if (action === 'get_messages') {
      if (!checkRateLimit(`msg:${actorId}`, 30, 60_000)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { conversation_id, limit = 50, before } = payload;

      const { data: member } = await admin
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', actorId)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let query = admin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ messages: (data || []).reverse() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SEND MESSAGE — rate limit: 10 per 10 seconds
    if (action === 'send_message') {
      if (!checkRateLimit(`send:${actorId}`, 10, 10_000)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { conversation_id, content } = payload;

      // Sanitize content
      const sanitizedContent = sanitizeString(content, 5000);

      if (!sanitizedContent) {
        return new Response(JSON.stringify({ error: 'Empty message' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify membership
      const { data: member } = await admin
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', actorId)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await admin.from('messages').insert({
        conversation_id,
        sender_id: actorId,
        content: sanitizedContent,
      }).select().single();

      if (error) throw error;

      await admin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation_id);

      await admin.from('conversation_members').update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversation_id)
        .eq('user_id', actorId);

      // Audit log
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'message.send', target_type: 'conversation', target_id: conversation_id, metadata: { message_id: data.id } });

      // Notify other members
      const { data: members } = await admin
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversation_id)
        .neq('user_id', actorId);

      if (members && members.length > 0) {
        const notifications = members.map((m) => ({
          user_id: m.user_id,
          type: 'new_message',
          title: 'New message received',
          body: sanitizedContent.substring(0, 100),
          reference_id: conversation_id,
          reference_type: 'conversation',
        }));
        await admin.from('notifications').insert(notifications);
      }

      return new Response(JSON.stringify({ message: data }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CREATE CONVERSATION
    if (action === 'create_conversation') {
      if (!checkRateLimit(`msg:${actorId}`, 30, 60_000)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { type = 'direct', name, member_ids } = payload;

      if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
        return new Response(JSON.stringify({ error: 'member_ids required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Sanitize conversation name
      const cleanName = name ? sanitizeString(name, 100) : null;

      // For direct chats, check if conversation already exists
      if (type === 'direct' && member_ids.length === 1) {
        const otherUserId = member_ids[0];
        const { data: existing } = await admin
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', actorId);

        if (existing) {
          for (const m of existing) {
            const { data: otherMember } = await admin
              .from('conversation_members')
              .select('conversation_id')
              .eq('conversation_id', m.conversation_id)
              .eq('user_id', otherUserId)
              .maybeSingle();

            if (otherMember) {
              const { data: conv } = await admin
                .from('conversations')
                .select('*')
                .eq('id', m.conversation_id)
                .eq('type', 'direct')
                .maybeSingle();

              if (conv) {
                return new Response(JSON.stringify({ conversation: conv, existing: true }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }
          }
        }
      }

      const { data: conv, error } = await admin.from('conversations').insert({
        type,
        name: cleanName,
        created_by: actorId,
      }).select().single();

      if (error) throw error;

      // Add members including creator
      const allMembers = [...new Set([actorId, ...member_ids])];
      const { error: mErr } = await admin.from('conversation_members').insert(
        allMembers.map(uid => ({ conversation_id: conv.id, user_id: uid }))
      );

      if (mErr) throw mErr;

      return new Response(JSON.stringify({ conversation: conv }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // MARK READ
    if (action === 'mark_read') {
      if (!checkRateLimit(`msg:${actorId}`, 30, 60_000)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { conversation_id } = payload;

      const { data: member } = await admin
        .from('conversation_members')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('user_id', actorId)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await admin.from('conversation_members').update({
        last_read_at: new Date().toISOString(),
      }).eq('conversation_id', conversation_id).eq('user_id', actorId);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('messages error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

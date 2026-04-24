import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ─── Edge Function ───

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sanitizeString(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string') return null;
  return val.replace(/<[^>]*>/g, '').trim().substring(0, maxLen) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify Auth0 JWT — extract user_id from token sub claim
  let user_id: string;
  try {
    user_id = await verifyAuth0Jwt(req);
  } catch (err) {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: "anonymous",
      action: "auth.failure",
      target_type: "sync-profile",
      metadata: { reason: err instanceof Error ? err.message : "Unknown" },
    });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit: 30 requests per 60 seconds per user
  if (!checkRateLimit(`sync:${user_id}`, 30, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Action: update_profile (display_name, avatar_url) ───
    if (action === 'update_profile') {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ('display_name' in body) {
        const cleaned = sanitizeString(body.display_name, 100);
        if (!cleaned || cleaned.length < 2) {
          return new Response(JSON.stringify({ error: 'Display name must be 2-100 characters' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        updates.display_name = cleaned;
      }
      if ('avatar_url' in body) {
        updates.avatar_url = body.avatar_url === null ? null : sanitizeString(body.avatar_url, 500);
      }

      const { data: updated, error: updErr } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('user_id', user_id)
        .select()
        .single();

      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: roles } = await supabaseAdmin
        .from('user_roles').select('role').eq('user_id', user_id);

      return new Response(
        JSON.stringify({ profile: updated, roles: (roles || []).map((r: { role: string }) => r.role) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Action: upload_avatar ───
    if (action === 'upload_avatar') {
      const { file_base64, content_type, file_name } = body;
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!file_base64 || typeof file_base64 !== 'string' || !allowed.includes(content_type)) {
        return new Response(JSON.stringify({ error: 'Invalid file. Must be JPG, PNG, or WEBP.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Decode base64 (strip data URL prefix if present)
      const b64 = file_base64.includes(',') ? file_base64.split(',')[1] : file_base64;
      let bytes: Uint8Array;
      try {
        const binary = atob(b64);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid base64 data' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Max 2 MB
      if (bytes.length > 2 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: 'File too large (max 2 MB)' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ext = content_type === 'image/png' ? 'png' : content_type === 'image/webp' ? 'webp' : 'jpg';
      const safeName = sanitizeString(file_name, 80)?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'avatar';
      // Supabase Storage rejects '|' in object keys; sanitize Auth0 user_id (e.g. "auth0|abc")
      const safeUserId = user_id.replace(/[|]/g, '_');
      const path = `${safeUserId}/${Date.now()}_${safeName}.${ext}`;

      // Delete previous avatar files under this user's prefix
      const { data: existing } = await supabaseAdmin.storage.from('avatars').list(safeUserId);
      if (existing && existing.length > 0) {
        const toRemove = existing.map((f) => `${safeUserId}/${f.name}`);
        await supabaseAdmin.storage.from('avatars').remove(toRemove);
      }

      // Upload
      const { error: upErr } = await supabaseAdmin.storage
        .from('avatars')
        .upload(path, bytes, { contentType: content_type, upsert: false });
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: pub } = supabaseAdmin.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { data: updated, error: updErr } = await supabaseAdmin
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('user_id', user_id)
        .select()
        .single();
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: roles } = await supabaseAdmin
        .from('user_roles').select('role').eq('user_id', user_id);

      return new Response(
        JSON.stringify({ profile: updated, roles: (roles || []).map((r: { role: string }) => r.role) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Default: login-time sync (backward compatibility) ───
    const { email, display_name, avatar_url } = body;

    // Sanitize inputs
    const cleanEmail = sanitizeString(email, 255);
    const cleanDisplayName = sanitizeString(display_name, 100);
    const cleanAvatarUrl = sanitizeString(avatar_url, 500);

    // Check if a profile already exists for this Auth0 user_id
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user_id)
      .limit(1);

    let profile;
    let profileError;

    if (existingProfile && existingProfile.length > 0) {
      // Profile exists — only refresh email/status. Do NOT overwrite user-edited display_name or avatar_url.
      const result = await supabaseAdmin
        .from("profiles")
        .update({
          email: cleanEmail,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id)
        .select()
        .single();
      profile = result.data;
      profileError = result.error;
    } else if (cleanEmail) {
      // No profile for this user_id — check for a pending profile by email
      const { data: pendingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id")
        .eq("email", cleanEmail.toLowerCase().trim())
        .is("deleted_at", null)
        .limit(1);

      if (pendingProfile && pendingProfile.length > 0 && pendingProfile[0].user_id.startsWith("pending|")) {
        // Link pending profile to real Auth0 user_id
        const result = await supabaseAdmin
          .from("profiles")
          .update({
            user_id,
            display_name: cleanDisplayName,
            avatar_url: cleanAvatarUrl,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingProfile[0].id)
          .select()
          .single();
        profile = result.data;
        profileError = result.error;

        // Also update user_roles to use the real user_id
        await supabaseAdmin
          .from("user_roles")
          .update({ user_id })
          .eq("user_id", pendingProfile[0].user_id);
      } else {
        // No pending profile — create new
        const result = await supabaseAdmin
          .from("profiles")
          .upsert(
            {
              user_id,
              email: cleanEmail,
              display_name: cleanDisplayName,
              avatar_url: cleanAvatarUrl,
              status: 'active',
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          )
          .select()
          .single();
        profile = result.data;
        profileError = result.error;
      }
    } else {
      // No email, just upsert
      const result = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            user_id,
            email: cleanEmail,
            display_name: cleanDisplayName,
            avatar_url: cleanAvatarUrl,
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();
      profile = result.data;
      profileError = result.error;
    }

    if (profileError) {
      console.error("Profile upsert error:", profileError);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    if (rolesError) {
      console.error("Roles fetch error:", rolesError);
    }

    return new Response(
      JSON.stringify({
        profile,
        roles: (roles || []).map((r: { role: string }) => r.role),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Sync profile error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

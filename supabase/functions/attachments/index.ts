import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

// ─── Types & Constants ───

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/zip', 'application/x-zip-compressed'] as const;
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type AttachmentAction = 'upload' | 'list' | 'list_by_entity_ids' | 'delete';
type EntityType = 'task' | 'comment' | 'message';

interface AttachmentRequest {
  action?: AttachmentAction;
  file_name?: string;
  file_base64?: string;
  entity_type?: EntityType;
  entity_id?: string;
  entity_ids?: string[];
  attachment_id?: string;
}

interface TaskPermissionRow { created_by: string; assigned_to: string | null }
interface CommentRow { task_id: string }
interface MessageRow { conversation_id: string }
interface ConversationMemberRow { id: string }

interface AttachmentRow {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  storage_path: string;
  uploaded_by: string;
  entity_type: EntityType;
  entity_id: string;
  created_at?: string;
  deleted_at?: string | null;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.substring(idx).toLowerCase() : '';
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i += 1) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

// ─── Access validation helpers ───

async function validateTaskAccess(admin: ReturnType<typeof createClient>, entityId: string, actorId: string): Promise<boolean> {
  const { data: task } = await admin.from('tasks').select('created_by, assigned_to').eq('id', entityId).single<TaskPermissionRow>();
  return !!task && (task.created_by === actorId || task.assigned_to === actorId);
}

async function validateCommentAccess(admin: ReturnType<typeof createClient>, entityId: string, actorId: string): Promise<boolean> {
  const { data: comment } = await admin.from('task_comments').select('task_id').eq('id', entityId).maybeSingle<CommentRow>();
  if (!comment) return false;
  return validateTaskAccess(admin, comment.task_id, actorId);
}

async function validateMessageAccess(admin: ReturnType<typeof createClient>, entityId: string, actorId: string): Promise<boolean> {
  const { data: msg } = await admin.from('messages').select('conversation_id').eq('id', entityId).maybeSingle<MessageRow>();
  if (!msg) return false;
  const { data: member } = await admin.from('conversation_members').select('id').eq('conversation_id', msg.conversation_id).eq('user_id', actorId).maybeSingle<ConversationMemberRow>();
  return !!member;
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
    try {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await sb.from('audit_logs').insert({ actor_id: 'anonymous', action: 'auth.failure', target_type: 'attachments', metadata: { reason: err instanceof Error ? err.message : 'Unknown' } });
    } catch { /* best effort */ }
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json()) as AttachmentRequest;
    const { action } = body;

    if (!action) return jsonResponse({ error: 'Missing action' }, 400);

    if (action === 'upload') {
      // Rate limit: 5 uploads per 60 seconds
      if (!checkRateLimit(`upload:${actorId}`, 5, 60_000)) {
        return jsonResponse({ error: 'Too many requests' }, 429);
      }

      const { file_name, file_base64, entity_type, entity_id } = body;
      if (!file_name || !file_base64 || !entity_type || !entity_id) return jsonResponse({ error: 'file_name, file_base64, entity_type, and entity_id are required' }, 400);
      if (!['task', 'comment', 'message'].includes(entity_type)) return jsonResponse({ error: 'entity_type must be task, comment, or message' }, 400);

      const ext = getExtension(file_name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) return jsonResponse({ error: 'Only images (jpg, png, gif, webp), PDF, and ZIP files are allowed' }, 400);

      const bytes = decodeBase64ToBytes(file_base64);
      if (bytes.length > MAX_FILE_SIZE) return jsonResponse({ error: 'File size exceeds 5MB limit' }, 400);

      const contentType = getMimeType(ext);
      if (!ALLOWED_MIME_TYPES.includes(contentType as (typeof ALLOWED_MIME_TYPES)[number])) return jsonResponse({ error: 'Unsupported content type' }, 400);

      // Validate access
      if (entity_type === 'task') {
        if (!(await validateTaskAccess(admin, entity_id, actorId))) return jsonResponse({ error: 'Forbidden' }, 403);
      } else if (entity_type === 'comment') {
        if (!(await validateCommentAccess(admin, entity_id, actorId))) return jsonResponse({ error: 'Forbidden' }, 403);
      } else if (entity_type === 'message') {
        if (!(await validateMessageAccess(admin, entity_id, actorId))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const timestamp = Date.now();
      const sanitizedName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${entity_type}/${entity_id}/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await admin.storage.from('attachments').upload(storagePath, bytes, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { data: attachment, error: insertError } = await admin.from('attachments').insert({
        file_name: file_name.trim().substring(0, 255),
        file_size: bytes.length,
        content_type: contentType,
        storage_path: storagePath,
        uploaded_by: actorId,
        entity_type,
        entity_id,
      }).select().single<AttachmentRow>();
      if (insertError) throw insertError;

      // Audit log
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'attachment.upload', target_type: entity_type, target_id: entity_id, metadata: { attachment_id: attachment.id, file_name: sanitizedName, file_size: bytes.length } });

      if (entity_type === 'task') {
        await admin.from('task_activity_logs').insert({ task_id: entity_id, actor_id: actorId, old_status: null, new_status: null, note: `Attached file: ${file_name}` });
      }

      return jsonResponse({ attachment }, 201);
    }

    if (action === 'list') {
      if (!checkRateLimit(`att:${actorId}`, 30, 60_000)) {
        return jsonResponse({ error: 'Too many requests' }, 429);
      }

      const { entity_type, entity_id } = body;
      if (!entity_type || !entity_id) return jsonResponse({ error: 'entity_type and entity_id are required' }, 400);

      if (entity_type === 'task') {
        if (!(await validateTaskAccess(admin, entity_id, actorId))) return jsonResponse({ error: 'Forbidden' }, 403);
      } else if (entity_type === 'comment') {
        if (!(await validateCommentAccess(admin, entity_id, actorId))) return jsonResponse({ error: 'Forbidden' }, 403);
      } else if (entity_type === 'message') {
        if (!(await validateMessageAccess(admin, entity_id, actorId))) return jsonResponse({ error: 'Forbidden' }, 403);
      }

      const { data, error } = await admin.from('attachments').select('*').eq('entity_type', entity_type).eq('entity_id', entity_id).is('deleted_at', null).order('created_at', { ascending: true });
      if (error) throw error;

      const attachments = [];
      for (const attachment of (data ?? []) as AttachmentRow[]) {
        const { data: signedUrlData, error: signedUrlError } = await admin.storage.from('attachments').createSignedUrl(attachment.storage_path, 3600);
        if (signedUrlError) {
          console.error('Signed URL error:', signedUrlError);
          continue;
        }
        attachments.push({ ...attachment, url: signedUrlData.signedUrl });
      }

      return jsonResponse({ attachments });
    }

    if (action === 'list_by_entity_ids') {
      if (!checkRateLimit(`att:${actorId}`, 30, 60_000)) {
        return jsonResponse({ error: 'Too many requests' }, 429);
      }

      const { entity_type, entity_ids } = body;
      if (!entity_type || !entity_ids || !Array.isArray(entity_ids) || entity_ids.length === 0) {
        return jsonResponse({ error: 'entity_type and entity_ids[] are required' }, 400);
      }

      // Limit batch size
      const ids = (entity_ids as string[]).slice(0, 200);

      const { data, error } = await admin.from('attachments')
        .select('*')
        .eq('entity_type', entity_type)
        .in('entity_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const attachments = [];
      for (const attachment of (data ?? []) as AttachmentRow[]) {
        const { data: signedUrlData, error: signedUrlError } = await admin.storage.from('attachments').createSignedUrl(attachment.storage_path, 3600);
        if (signedUrlError) { console.error('Signed URL error:', signedUrlError); continue; }
        attachments.push({ ...attachment, url: signedUrlData.signedUrl });
      }

      return jsonResponse({ attachments });
    }
      if (!checkRateLimit(`att:${actorId}`, 30, 60_000)) {
        return jsonResponse({ error: 'Too many requests' }, 429);
      }

      const { attachment_id } = body;
      if (!attachment_id) return jsonResponse({ error: 'attachment_id is required' }, 400);

      const { data: attachment, error: attachmentError } = await admin.from('attachments').select('*').eq('id', attachment_id).is('deleted_at', null).single<AttachmentRow>();
      if (attachmentError) {
        if ('code' in attachmentError && attachmentError.code === 'PGRST116') return jsonResponse({ error: 'Attachment not found' }, 404);
        throw attachmentError;
      }
      if (!attachment) return jsonResponse({ error: 'Attachment not found' }, 404);
      if (attachment.uploaded_by !== actorId) return jsonResponse({ error: 'Only the uploader can delete this attachment' }, 403);

      await admin.from('attachments').update({ deleted_at: new Date().toISOString() }).eq('id', attachment_id);
      await admin.storage.from('attachments').remove([attachment.storage_path]);

      // Audit log
      await admin.from('audit_logs').insert({ actor_id: actorId, action: 'attachment.delete', target_type: attachment.entity_type, target_id: attachment.entity_id, metadata: { attachment_id, file_name: attachment.file_name } });

      if (attachment.entity_type === 'task') {
        await admin.from('task_activity_logs').insert({ task_id: attachment.entity_id, actor_id: actorId, old_status: null, new_status: null, note: `Removed file: ${attachment.file_name}` });
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err: unknown) {
    console.error('attachments error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

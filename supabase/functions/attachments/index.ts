import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_EXTENSIONS = ['.zip', '.rar'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream',
] as const;

type AttachmentAction = 'upload' | 'list' | 'delete';
type EntityType = 'task' | 'comment' | 'message';

interface AttachmentRequest {
  action?: AttachmentAction;
  actor_id?: string;
  file_name?: string;
  file_base64?: string;
  entity_type?: EntityType;
  entity_id?: string;
  attachment_id?: string;
}

interface TaskPermissionRow {
  created_by: string;
  assigned_to: string | null;
}

interface CommentRow {
  task_id: string;
}

interface MessageRow {
  conversation_id: string;
}

interface ConversationMemberRow {
  id: string;
}

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Internal server error';
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.substring(idx).toLowerCase() : '';
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);

  for (let i = 0; i < binaryStr.length; i += 1) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return bytes;
}

function getContentTypeFromExtension(ext: string): string {
  return ext === '.zip' ? 'application/zip' : 'application/x-rar-compressed';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing required environment variables' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json()) as AttachmentRequest;
    const { action, actor_id } = body;

    if (!actor_id) {
      return jsonResponse({ error: 'Missing actor_id' }, 400);
    }

    if (!action) {
      return jsonResponse({ error: 'Missing action' }, 400);
    }

    if (action === 'upload') {
      const { file_name, file_base64, entity_type, entity_id } = body;

      if (!file_name || !file_base64 || !entity_type || !entity_id) {
        return jsonResponse(
          { error: 'file_name, file_base64, entity_type, and entity_id are required' },
          400,
        );
      }

      if (!['task', 'comment', 'message'].includes(entity_type)) {
        return jsonResponse(
          { error: 'entity_type must be task, comment, or message' },
          400,
        );
      }

      const ext = getExtension(file_name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return jsonResponse({ error: 'Only .zip and .rar files are allowed' }, 400);
      }

      const bytes = decodeBase64ToBytes(file_base64);

      if (bytes.length > MAX_FILE_SIZE) {
        return jsonResponse({ error: 'File size exceeds 10MB limit' }, 400);
      }

      const contentType = getContentTypeFromExtension(ext);
      if (!ALLOWED_MIME_TYPES.includes(contentType as (typeof ALLOWED_MIME_TYPES)[number])) {
        return jsonResponse({ error: 'Unsupported content type' }, 400);
      }

      if (entity_type === 'task') {
        const { data: task, error: taskError } = await admin
          .from('tasks')
          .select('created_by, assigned_to')
          .eq('id', entity_id)
          .single<TaskPermissionRow>();

        if (taskError) {
          throw taskError;
        }

        if (!task || (task.created_by !== actor_id && task.assigned_to !== actor_id)) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
      } else if (entity_type === 'comment') {
        const { data: comment, error: commentError } = await admin
          .from('task_comments')
          .select('task_id')
          .eq('id', entity_id)
          .single<CommentRow>();

        if (commentError) {
          if ('code' in commentError && commentError.code === 'PGRST116') {
            return jsonResponse({ error: 'Comment not found' }, 404);
          }
          throw commentError;
        }

        const { data: task, error: taskError } = await admin
          .from('tasks')
          .select('created_by, assigned_to')
          .eq('id', comment.task_id)
          .single<TaskPermissionRow>();

        if (taskError) {
          throw taskError;
        }

        if (!task || (task.created_by !== actor_id && task.assigned_to !== actor_id)) {
          return jsonResponse({ error: 'Forbidden' }, 403);
        }
      } else if (entity_type === 'message') {
        const { data: msg, error: messageError } = await admin
          .from('messages')
          .select('conversation_id')
          .eq('id', entity_id)
          .maybeSingle<MessageRow>();

        if (messageError) {
          throw messageError;
        }

        if (msg) {
          const { data: member, error: memberError } = await admin
            .from('conversation_members')
            .select('id')
            .eq('conversation_id', msg.conversation_id)
            .eq('user_id', actor_id)
            .maybeSingle<ConversationMemberRow>();

          if (memberError) {
            throw memberError;
          }

          if (!member) {
            return jsonResponse({ error: 'Forbidden' }, 403);
          }
        }
      }

      const timestamp = Date.now();
      const sanitizedName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${entity_type}/${entity_id}/${timestamp}_${sanitizedName}`;

      const { error: uploadError } = await admin.storage
        .from('attachments')
        .upload(storagePath, bytes, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: attachment, error: insertError } = await admin
        .from('attachments')
        .insert({
          file_name: file_name.trim(),
          file_size: bytes.length,
          content_type: contentType,
          storage_path: storagePath,
          uploaded_by: actor_id,
          entity_type,
          entity_id,
        })
        .select()
        .single<AttachmentRow>();

      if (insertError) {
        throw insertError;
      }

      if (entity_type === 'task') {
        const { error: activityError } = await admin.from('task_activity_logs').insert({
          task_id: entity_id,
          actor_id,
          old_status: null,
          new_status: null,
          note: `Attached file: ${file_name}`,
        });

        if (activityError) {
          throw activityError;
        }
      }

      return jsonResponse({ attachment }, 201);
    }

    if (action === 'list') {
      const { entity_type, entity_id } = body;

      if (!entity_type || !entity_id) {
        return jsonResponse({ error: 'entity_type and entity_id are required' }, 400);
      }

      const { data, error } = await admin
        .from('attachments')
        .select('*')
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      const attachments = ((data ?? []) as AttachmentRow[]).map((attachment) => {
        const { data: urlData } = admin.storage
          .from('attachments')
          .getPublicUrl(attachment.storage_path);

        return {
          ...attachment,
          url: urlData.publicUrl,
        };
      });

      return jsonResponse({ attachments });
    }

    if (action === 'delete') {
      const { attachment_id } = body;

      if (!attachment_id) {
        return jsonResponse({ error: 'attachment_id is required' }, 400);
      }

      const { data: attachment, error: attachmentError } = await admin
        .from('attachments')
        .select('*')
        .eq('id', attachment_id)
        .is('deleted_at', null)
        .single<AttachmentRow>();

      if (attachmentError) {
        if ('code' in attachmentError && attachmentError.code === 'PGRST116') {
          return jsonResponse({ error: 'Attachment not found' }, 404);
        }
        throw attachmentError;
      }

      if (!attachment) {
        return jsonResponse({ error: 'Attachment not found' }, 404);
      }

      if (attachment.uploaded_by !== actor_id) {
        return jsonResponse(
          { error: 'Only the uploader can delete this attachment' },
          403,
        );
      }

      const { error: softDeleteError } = await admin
        .from('attachments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', attachment_id);

      if (softDeleteError) {
        throw softDeleteError;
      }

      const { error: storageRemoveError } = await admin.storage
        .from('attachments')
        .remove([attachment.storage_path]);

      if (storageRemoveError) {
        throw storageRemoveError;
      }

      if (attachment.entity_type === 'task') {
        const { error: activityError } = await admin.from('task_activity_logs').insert({
          task_id: attachment.entity_id,
          actor_id,
          old_status: null,
          new_status: null,
          note: `Removed file: ${attachment.file_name}`,
        });

        if (activityError) {
          throw activityError;
        }
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err: unknown) {
    console.error('attachments error:', err);
    return jsonResponse({ error: getErrorMessage(err) }, 500);
  }
});
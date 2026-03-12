import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ALLOWED_EXTENSIONS = ['.zip', '.rar'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream', // fallback for .rar
];

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.substring(idx).toLowerCase() : '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action, actor_id, ...payload } = body;

    if (!actor_id) {
      return new Response(JSON.stringify({ error: 'Missing actor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── UPLOAD ──────────────────────────────────────────────
    if (action === 'upload') {
      const { file_name, file_base64, entity_type, entity_id } = payload;

      if (!file_name || !file_base64 || !entity_type || !entity_id) {
        return new Response(JSON.stringify({ error: 'file_name, file_base64, entity_type, and entity_id are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate entity_type
      if (!['task', 'comment', 'message'].includes(entity_type)) {
        return new Response(JSON.stringify({ error: 'entity_type must be task, comment, or message' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate file extension
      const ext = getExtension(file_name);
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return new Response(JSON.stringify({ error: 'Only .zip and .rar files are allowed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Decode base64
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Validate file size
      if (bytes.length > MAX_FILE_SIZE) {
        return new Response(JSON.stringify({ error: 'File size exceeds 10MB limit' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate access based on entity type
      if (entity_type === 'task') {
        const { data: task } = await admin.from('tasks')
          .select('created_by, assigned_to')
          .eq('id', entity_id)
          .single();
        if (!task || (task.created_by !== actor_id && task.assigned_to !== actor_id)) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else if (entity_type === 'comment') {
        // Comments belong to tasks; verify via task_comments
        const { data: comment } = await admin.from('task_comments')
          .select('task_id')
          .eq('id', entity_id)
          .single();
        if (!comment) {
          return new Response(JSON.stringify({ error: 'Comment not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data: task } = await admin.from('tasks')
          .select('created_by, assigned_to')
          .eq('id', comment.task_id)
          .single();
        if (!task || (task.created_by !== actor_id && task.assigned_to !== actor_id)) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else if (entity_type === 'message') {
        // For messages, check conversation membership via the message's conversation
        const { data: msg } = await admin.from('messages')
          .select('conversation_id')
          .eq('id', entity_id)
          .single();
        if (msg) {
          const { data: member } = await admin.from('conversation_members')
            .select('id')
            .eq('conversation_id', msg.conversation_id)
            .eq('user_id', actor_id)
            .maybeSingle();
          if (!member) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        // If message doesn't exist yet (uploading before sending), allow it
      }

      // Upload to storage
      const timestamp = Date.now();
      const sanitizedName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${entity_type}/${entity_id}/${timestamp}_${sanitizedName}`;
      const contentType = ext === '.zip' ? 'application/zip' : 'application/x-rar-compressed';

      const { error: uploadError } = await admin.storage
        .from('attachments')
        .upload(storagePath, bytes, {
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Record metadata
      const { data: attachment, error: insertError } = await admin.from('attachments').insert({
        file_name: file_name.trim(),
        file_size: bytes.length,
        content_type: contentType,
        storage_path: storagePath,
        uploaded_by: actor_id,
        entity_type,
        entity_id,
      }).select().single();

      if (insertError) throw insertError;

      // Log activity for task attachments
      if (entity_type === 'task') {
        await admin.from('task_activity_logs').insert({
          task_id: entity_id,
          actor_id,
          old_status: null,
          new_status: null,
          note: `Attached file: ${file_name}`,
        });
      }

      return new Response(JSON.stringify({ attachment }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── LIST ────────────────────────────────────────────────
    if (action === 'list') {
      const { entity_type, entity_id } = payload;

      if (!entity_type || !entity_id) {
        return new Response(JSON.stringify({ error: 'entity_type and entity_id are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await admin.from('attachments')
        .select('*')
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Build public URLs
      const enriched = (data || []).map((a: any) => {
        const { data: urlData } = admin.storage.from('attachments').getPublicUrl(a.storage_path);
        return { ...a, url: urlData.publicUrl };
      });

      return new Response(JSON.stringify({ attachments: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── DELETE ──────────────────────────────────────────────
    if (action === 'delete') {
      const { attachment_id } = payload;

      if (!attachment_id) {
        return new Response(JSON.stringify({ error: 'attachment_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: attachment } = await admin.from('attachments')
        .select('*')
        .eq('id', attachment_id)
        .is('deleted_at', null)
        .single();

      if (!attachment) {
        return new Response(JSON.stringify({ error: 'Attachment not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Only uploader can delete
      if (attachment.uploaded_by !== actor_id) {
        return new Response(JSON.stringify({ error: 'Only the uploader can delete this attachment' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Soft delete metadata
      await admin.from('attachments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', attachment_id);

      // Delete from storage
      await admin.storage.from('attachments').remove([attachment.storage_path]);

      // Log activity for task attachments
      if (attachment.entity_type === 'task') {
        await admin.from('task_activity_logs').insert({
          task_id: attachment.entity_id,
          actor_id,
          old_status: null,
          new_status: null,
          note: `Removed file: ${attachment.file_name}`,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('attachments error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

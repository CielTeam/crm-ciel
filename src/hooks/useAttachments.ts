import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type AttachmentEntityType = 'task' | 'comment' | 'message' | 'account';

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  storage_path: string;
  uploaded_by: string;
  entity_type: AttachmentEntityType;
  entity_id: string;
  created_at: string;
  url: string;
}

interface AttachmentsFunctionResponse {
  attachments?: Attachment[];
  attachment?: Attachment;
  success?: boolean;
  error?: string;
}

async function invokeAttachments(
  body: Record<string, unknown>,
  token: string
): Promise<AttachmentsFunctionResponse> {
  const { data, error } =
    await supabase.functions.invoke<AttachmentsFunctionResponse>('attachments', {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') { reject(new Error('Failed to read file')); return; }
      const base64 = result.split(',')[1];
      if (!base64) { reject(new Error('Failed to convert file to base64')); return; }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function useAttachments(
  entityType: AttachmentEntityType | null,
  entityId: string | null
) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['attachments', user?.id, entityType, entityId],
    queryFn: async () => {
      if (!entityType || !entityId) throw new Error('Missing attachment entity information');
      const token = await getToken();
      const data = await invokeAttachments({ action: 'list', entity_type: entityType, entity_id: entityId }, token);
      return data.attachments ?? [];
    },
    enabled: !!user?.id && !!entityType && !!entityId,
  });
}

export function useAttachmentsByEntityIds(
  entityType: AttachmentEntityType | null,
  entityIds: string[]
) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['attachments-batch', user?.id, entityType, entityIds],
    queryFn: async () => {
      if (!entityType || entityIds.length === 0) return new Map<string, Attachment[]>();
      const token = await getToken();
      const data = await invokeAttachments({ action: 'list_by_entity_ids', entity_type: entityType, entity_ids: entityIds }, token);
      const map = new Map<string, Attachment[]>();
      for (const att of data.attachments ?? []) {
        const list = map.get(att.entity_id) ?? [];
        list.push(att);
        map.set(att.entity_id, list);
      }
      return map;
    },
    enabled: !!user?.id && !!entityType && entityIds.length > 0,
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  const { user, getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { file: File; entity_type: AttachmentEntityType; entity_id: string }) => {
      const { file, entity_type, entity_id } = payload;
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip'];
      if (!allowedExts.includes(ext)) throw new Error('Only images (JPG, PNG, GIF, WEBP), PDF, and ZIP files are allowed');
      if (file.size > 5 * 1024 * 1024) throw new Error('File size exceeds 5MB limit');
      const token = await getToken();
      const file_base64 = await fileToBase64(file);
      const data = await invokeAttachments({ action: 'upload', file_name: file.name, file_base64, entity_type, entity_id }, token);
      if (!data.attachment) throw new Error('Attachment was not returned by the server');
      return data.attachment;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['attachments', user?.id, variables.entity_type, variables.entity_id] });
      qc.invalidateQueries({ queryKey: ['attachments-batch'] });
      if (variables.entity_type === 'task') qc.invalidateQueries({ queryKey: ['task-activity', variables.entity_id] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  const { user, getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { attachment_id: string; entity_type: AttachmentEntityType; entity_id: string }) => {
      const token = await getToken();
      await invokeAttachments({ action: 'delete', attachment_id: payload.attachment_id }, token);
      return payload;
    },
    onSuccess: (variables) => {
      qc.invalidateQueries({ queryKey: ['attachments', user?.id, variables.entity_type, variables.entity_id] });
      qc.invalidateQueries({ queryKey: ['attachments-batch'] });
      if (variables.entity_type === 'task') qc.invalidateQueries({ queryKey: ['task-activity', variables.entity_id] });
    },
  });
}

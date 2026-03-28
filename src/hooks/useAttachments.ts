import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type AttachmentEntityType = 'task' | 'comment' | 'message';

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

function getUserId(userId?: string): string {
  if (!userId) {
    throw new Error('User is not authenticated');
  }

  return userId;
}

async function invokeAttachments(
  body: Record<string, unknown>
): Promise<AttachmentsFunctionResponse> {
  const { data, error } =
    await supabase.functions.invoke<AttachmentsFunctionResponse>('attachments', {
      body,
    });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data ?? {};
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }

      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Failed to convert file to base64'));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

export function useAttachments(
  entityType: AttachmentEntityType | null,
  entityId: string | null
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['attachments', user?.id, entityType, entityId],
    queryFn: async () => {
      const actorId = getUserId(user?.id);

      if (!entityType || !entityId) {
        throw new Error('Missing attachment entity information');
      }

      const data = await invokeAttachments({
        action: 'list',
        actor_id: actorId,
        entity_type: entityType,
        entity_id: entityId,
      });

      return data.attachments ?? [];
    },
    enabled: !!user?.id && !!entityType && !!entityId,
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      file: File;
      entity_type: AttachmentEntityType;
      entity_id: string;
    }) => {
      const actorId = getUserId(user?.id);
      const { file, entity_type, entity_id } = payload;

      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      if (!['.zip', '.rar'].includes(ext)) {
        throw new Error('Only .zip and .rar files are allowed');
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size exceeds 10MB limit');
      }

      const file_base64 = await fileToBase64(file);

      const data = await invokeAttachments({
        action: 'upload',
        actor_id: actorId,
        file_name: file.name,
        file_base64,
        entity_type,
        entity_id,
      });

      if (!data.attachment) {
        throw new Error('Attachment was not returned by the server');
      }

      return data.attachment;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ['attachments', user?.id, variables.entity_type, variables.entity_id],
      });

      if (variables.entity_type === 'task') {
        qc.invalidateQueries({ queryKey: ['task-activity', variables.entity_id] });
      }
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      attachment_id: string;
      entity_type: AttachmentEntityType;
      entity_id: string;
    }) => {
      const actorId = getUserId(user?.id);

      await invokeAttachments({
        action: 'delete',
        actor_id: actorId,
        attachment_id: payload.attachment_id,
      });

      return payload;
    },
    onSuccess: (variables) => {
      qc.invalidateQueries({
        queryKey: ['attachments', user?.id, variables.entity_type, variables.entity_id],
      });

      if (variables.entity_type === 'task') {
        qc.invalidateQueries({ queryKey: ['task-activity', variables.entity_id] });
      }
    },
  });
}
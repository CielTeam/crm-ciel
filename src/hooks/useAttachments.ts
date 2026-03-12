import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  storage_path: string;
  uploaded_by: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  url: string;
}

export function useAttachments(entityType: string | null, entityId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('attachments', {
        body: { action: 'list', actor_id: user!.id, entity_type: entityType, entity_id: entityId },
      });
      if (error) throw error;
      return (data.attachments || []) as Attachment[];
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
      entity_type: string;
      entity_id: string;
    }) => {
      const { file, entity_type, entity_id } = payload;

      // Validate client-side
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (!['.zip', '.rar'].includes(ext)) {
        throw new Error('Only .zip and .rar files are allowed');
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size exceeds 10MB limit');
      }

      // Convert to base64
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const file_base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke('attachments', {
        body: {
          action: 'upload',
          actor_id: user!.id,
          file_name: file.name,
          file_base64,
          entity_type,
          entity_id,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data.attachment as Attachment;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['attachments', variables.entity_type, variables.entity_id] });
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
    mutationFn: async (payload: { attachment_id: string; entity_type: string; entity_id: string }) => {
      const { data, error } = await supabase.functions.invoke('attachments', {
        body: { action: 'delete', actor_id: user!.id, attachment_id: payload.attachment_id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['attachments', variables.entity_type, variables.entity_id] });
      if (variables.entity_type === 'task') {
        qc.invalidateQueries({ queryKey: ['task-activity', variables.entity_id] });
      }
    },
  });
}

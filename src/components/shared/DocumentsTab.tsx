import { useAuth } from '@/contexts/AuthContext';
import { useAttachments, useUploadAttachment, useDeleteAttachment, type Attachment } from '@/hooks/useAttachments';
import { FileUploadButton } from '@/components/shared/FileUploadButton';
import { FileAttachmentList } from '@/components/shared/FileAttachmentList';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentsTabProps {
  entityType: 'lead' | 'account';
  entityId: string;
}

export function DocumentsTab({ entityType, entityId }: DocumentsTabProps) {
  const { user } = useAuth();
  const { data: attachments, isLoading } = useAttachments(entityType, entityId);
  const upload = useUploadAttachment();
  const del = useDeleteAttachment();

  const handleFile = async (file: File) => {
    try {
      await upload.mutateAsync({ file, entity_type: entityType, entity_id: entityId });
      toast.success('File uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const handleDelete = async (att: Attachment) => {
    try {
      await del.mutateAsync({ attachment_id: att.id, entity_type: entityType, entity_id: entityId });
      toast.success('File deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Images (JPG, PNG, GIF, WEBP), PDF, ZIP — max 5MB
        </p>
        <FileUploadButton onFileSelected={handleFile} isUploading={upload.isPending} />
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : !attachments || attachments.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No documents uploaded yet.</p>
        </div>
      ) : (
        <FileAttachmentList
          attachments={attachments}
          currentUserId={user?.id || ''}
          onDelete={handleDelete}
          isDeleting={del.isPending}
        />
      )}
    </div>
  );
}

import { FileArchive, Download, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type Attachment } from '@/hooks/useAttachments';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileAttachmentListProps {
  attachments: Attachment[];
  currentUserId: string;
  onDelete?: (attachment: Attachment) => void;
  isDeleting?: boolean;
  compact?: boolean;
}

export function FileAttachmentList({
  attachments,
  currentUserId,
  onDelete,
  isDeleting,
  compact = false,
}: FileAttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {attachments.map((att) => (
        <div
          key={att.id}
          className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 group"
        >
          <FileArchive className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">{att.file_name}</p>
            {!compact && (
              <p className="text-[10px] text-muted-foreground">{formatFileSize(att.file_size)}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              asChild
            >
              <a href={att.url} download={att.file_name} target="_blank" rel="noopener noreferrer">
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
            {onDelete && att.uploaded_by === currentUserId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDelete(att)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useRef } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface FileUploadButtonProps {
  onFileSelected: (file: File) => void;
  isUploading?: boolean;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
}

export function FileUploadButton({
  onFileSelected,
  isUploading,
  variant = 'outline',
  size = 'sm',
  className,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.zip', '.rar'].includes(ext)) {
      toast.error('Only .zip and .rar files are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit');
      e.target.value = '';
      return;
    }

    onFileSelected(file);
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.rar"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
        {size !== 'icon' && (
          <span className="ml-1.5">{isUploading ? 'Uploading...' : 'Attach File'}</span>
        )}
      </Button>
    </>
  );
}

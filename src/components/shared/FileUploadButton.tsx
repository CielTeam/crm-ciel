import { useRef } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.zip'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPT_STRING = '.jpg,.jpeg,.png,.gif,.webp,.pdf,.zip';

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

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error('Only images (JPG, PNG, GIF, WEBP), PDF, and ZIP files are allowed');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds 5MB limit');
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
        accept={ACCEPT_STRING}
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

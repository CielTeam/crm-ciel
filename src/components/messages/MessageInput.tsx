import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { FileUploadButton } from '@/components/shared/FileUploadButton';

interface Props {
  onSend: (content: string) => void;
  onFileUpload?: (file: File) => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
  disabled?: boolean;
  isUploading?: boolean;
}

export function MessageInput({
  onSend,
  onFileUpload,
  onTyping,
  onStopTyping,
  disabled,
  isUploading,
}: Props) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();

    if (!trimmed || disabled) return;

    onSend(trimmed);
    onStopTyping?.();
    setValue('');
  }, [value, disabled, onSend, onStopTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 p-3 border-t bg-[hsl(var(--chat-surface))]">
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onTyping?.();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        rows={1}
        className="resize-none min-h-[40px] max-h-[120px] focus-visible:ring-[hsl(var(--chat-bubble-mine))] focus-visible:ring-offset-1"
        disabled={disabled}
      />

      {onFileUpload && (
        <FileUploadButton
          onFileSelected={onFileUpload}
          isUploading={isUploading}
          variant="ghost"
          size="icon"
        />
      )}

      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="bg-[hsl(var(--chat-bubble-mine))] hover:bg-[hsl(var(--chat-bubble-mine))]/90 text-white"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
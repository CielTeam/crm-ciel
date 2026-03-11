import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ReviewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'approve' | 'reject';
  taskTitle: string;
  onConfirm: (feedback?: string) => void;
  isLoading?: boolean;
}

export function ReviewTaskDialog({ open, onOpenChange, mode, taskTitle, onConfirm, isLoading }: ReviewTaskDialogProps) {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    if (mode === 'reject' && !feedback.trim()) return;
    onConfirm(feedback.trim() || undefined);
    setFeedback('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'approve' ? 'Approve Task' : 'Reject Task'}</DialogTitle>
          <DialogDescription>
            {mode === 'approve'
              ? `Approve "${taskTitle}"?`
              : `Reject "${taskTitle}"? Feedback is required.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>{mode === 'reject' ? 'Feedback (required)' : 'Feedback (optional)'}</Label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={mode === 'reject' ? 'Explain what needs to be fixed...' : 'Optional feedback...'}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={mode === 'reject' ? 'destructive' : 'default'}
            onClick={handleSubmit}
            disabled={isLoading || (mode === 'reject' && !feedback.trim())}
          >
            {isLoading ? 'Processing...' : mode === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface AcceptDeclineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'accept' | 'decline';
  taskTitle: string;
  onConfirm: (reason?: string) => void;
  isLoading?: boolean;
}

export function AcceptDeclineDialog({ open, onOpenChange, mode, taskTitle, onConfirm, isLoading }: AcceptDeclineDialogProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (mode === 'decline' && !reason.trim()) return;
    onConfirm(reason.trim() || undefined);
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'accept' ? 'Accept Task' : 'Decline Task'}</DialogTitle>
          <DialogDescription>
            {mode === 'accept'
              ? `Accept "${taskTitle}"?`
              : `Decline "${taskTitle}"? Please provide a reason.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'decline' && (
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you declining this task?"
              rows={3}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={mode === 'decline' ? 'destructive' : 'default'}
            onClick={handleSubmit}
            disabled={isLoading || (mode === 'decline' && !reason.trim())}
          >
            {isLoading ? 'Processing...' : mode === 'accept' ? 'Accept' : 'Decline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

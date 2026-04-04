import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SubmitTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onConfirm: (data: { challenges?: string; actual_duration?: string; completion_notes?: string }) => void;
  isLoading?: boolean;
}

export function SubmitTaskDialog({ open, onOpenChange, taskTitle, onConfirm, isLoading }: SubmitTaskDialogProps) {
  const [challenges, setChallenges] = useState('');
  const [actualDuration, setActualDuration] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');

  const handleSubmit = () => {
    onConfirm({
      challenges: challenges.trim() || undefined,
      actual_duration: actualDuration.trim() || undefined,
      completion_notes: completionNotes.trim() || undefined,
    });
    setChallenges('');
    setActualDuration('');
    setCompletionNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Task for Review</DialogTitle>
          <DialogDescription>
            Submit &quot;{taskTitle}&quot; to your lead for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Actual Duration</Label>
            <Input
              value={actualDuration}
              onChange={(e) => setActualDuration(e.target.value)}
              placeholder="e.g. 3 hours, 2 days"
            />
          </div>

          <div className="space-y-2">
            <Label>Completion Notes (optional)</Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Any notes about the completed work..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Challenges Faced (optional)</Label>
            <Textarea
              value={challenges}
              onChange={(e) => setChallenges(e.target.value)}
              placeholder="Describe any challenges encountered..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Submitting...' : 'Submit for Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

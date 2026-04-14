import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOST_REASONS, type LeadLostReason } from '@/hooks/useLeads';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: LeadLostReason, notes: string) => void;
  isPending?: boolean;
}

export function LostReasonDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState<LeadLostReason | ''>('');
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason, notes);
    setReason('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mark Lead as Lost
          </DialogTitle>
          <DialogDescription>
            Please provide a reason for losing this lead. This helps improve future sales performance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Lost Reason *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as LeadLostReason)}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Additional Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context about why this lead was lost..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason || isPending}>
            {isPending ? 'Saving...' : 'Confirm Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

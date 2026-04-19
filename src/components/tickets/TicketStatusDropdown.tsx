import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2 } from 'lucide-react';
import { TicketStatusBadge } from './TicketStatusBadge';
import { getAllowedTransitions, type TicketStatus, useChangeTicketStatus } from '@/hooks/useTickets';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open', in_progress: 'In Progress', waiting: 'Waiting',
  resolved: 'Resolved', closed: 'Closed', archived: 'Archived',
};

interface Props {
  ticketId: string;
  status: TicketStatus;
  canUnarchive?: boolean;
}

export function TicketStatusDropdown({ ticketId, status, canUnarchive }: Props) {
  const change = useChangeTicketStatus();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState('');
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);

  const allowed = getAllowedTransitions(status);
  // Special case: archived → only admin can un-archive (server still enforces)
  const options: TicketStatus[] = status === 'archived'
    ? (canUnarchive ? ['in_progress', 'open'] : [])
    : allowed;

  const handleChange = (next: TicketStatus) => {
    if (next === 'resolved' || next === 'closed') {
      setPendingStatus(next);
      setResolveOpen(true);
      return;
    }
    change.mutate({ id: ticketId, status: next }, {
      onSuccess: () => toast.success(`Status changed to ${STATUS_LABEL[next]}`),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to change status'),
    });
  };

  const handleConfirmResolution = () => {
    if (!pendingStatus) return;
    change.mutate(
      { id: ticketId, status: pendingStatus, resolution_summary: resolution.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Status changed to ${STATUS_LABEL[pendingStatus]}`);
          setResolveOpen(false);
          setResolution('');
          setPendingStatus(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to change status'),
      }
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-auto py-1 px-2 gap-1.5" disabled={change.isPending}>
            <TicketStatusBadge status={status} />
            {change.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {options.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              No transitions available
            </DropdownMenuItem>
          )}
          {options.map((s) => (
            <DropdownMenuItem key={s} onClick={() => handleChange(s)}>
              {STATUS_LABEL[s]}
            </DropdownMenuItem>
          ))}
          {status !== 'archived' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => handleChange('archived')}
              >
                Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingStatus === 'resolved' ? 'Resolve' : 'Close'} Ticket</DialogTitle>
            <DialogDescription>Optionally add a resolution summary for the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Resolution summary (optional)</Label>
            <Textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="What was done to resolve this ticket?"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmResolution} disabled={change.isPending}>
              {change.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

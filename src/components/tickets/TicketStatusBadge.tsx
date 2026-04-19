import { Badge } from '@/components/ui/badge';
import type { TicketStatus, TicketPriority } from '@/hooks/useTickets';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'bg-primary/15 text-primary border-primary/30',
  in_progress: 'bg-warning/15 text-warning-foreground border-warning/30',
  waiting: 'bg-muted text-muted-foreground border-border',
  resolved: 'bg-success/15 text-success border-success/30',
  closed: 'bg-secondary text-secondary-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border opacity-70',
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
  archived: 'Archived',
};

export function TicketStatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium border', STATUS_STYLES[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-primary/10 text-primary',
  high: 'bg-warning/15 text-warning-foreground',
  urgent: 'bg-destructive/15 text-destructive',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
};

export function TicketPriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', PRIORITY_STYLES[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

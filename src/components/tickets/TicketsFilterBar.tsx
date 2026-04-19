import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TICKET_STATUSES, TICKET_TYPES, TICKET_PRIORITIES, type TicketStatus, type TicketType, type TicketPriority } from '@/hooks/useTickets';

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open', in_progress: 'In Progress', waiting: 'Waiting',
  resolved: 'Resolved', closed: 'Closed', archived: 'Archived',
};
const TYPE_LABEL: Record<TicketType, string> = {
  support: 'Support', incident: 'Incident', service_request: 'Service Request',
  maintenance: 'Maintenance', deployment: 'Deployment', bug_fix: 'Bug Fix', other: 'Other',
};
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
};

interface Props {
  search: string; onSearchChange: (v: string) => void;
  status: TicketStatus | 'all'; onStatusChange: (v: TicketStatus | 'all') => void;
  ticketType: TicketType | 'all'; onTypeChange: (v: TicketType | 'all') => void;
  priority: TicketPriority | 'all'; onPriorityChange: (v: TicketPriority | 'all') => void;
  hideTypeFilter?: boolean;
  onReset: () => void;
}

export function TicketsFilterBar({
  search, onSearchChange, status, onStatusChange,
  ticketType, onTypeChange, priority, onPriorityChange, hideTypeFilter, onReset,
}: Props) {
  const hasFilters = search || status !== 'all' || ticketType !== 'all' || priority !== 'all';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tickets..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <Select value={status} onValueChange={(v) => onStatusChange(v as TicketStatus | 'all')}>
        <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
        </SelectContent>
      </Select>

      {!hideTypeFilter && (
        <Select value={ticketType} onValueChange={(v) => onTypeChange(v as TicketType | 'all')}>
          <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={priority} onValueChange={(v) => onPriorityChange(v as TicketPriority | 'all')}>
        <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9">
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}

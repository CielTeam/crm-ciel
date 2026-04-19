import { useState, useMemo } from 'react';
import { Plus, Loader2, Ticket as TicketIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { useTickets, SUPPORT_TYPES, type TicketStatus, type TicketPriority } from '@/hooks/useTickets';
import { TicketsFilterBar } from '@/components/tickets/TicketsFilterBar';
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/tickets/TicketStatusBadge';
import { AddTicketDialog } from '@/components/tickets/AddTicketDialog';
import { TicketDetailSheet } from '@/components/tickets/TicketDetailSheet';
import { PageError } from '@/components/PageError';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAccountsWithContacts } from '@/hooks/useAccountsContacts';

const PAGE_SIZE = 25;

export function SupportTicketsTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TicketStatus | 'all'>('all');
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = useMemo(() => ({
    search: search || undefined,
    status: status !== 'all' ? [status] : undefined,
    ticket_type: [...SUPPORT_TYPES],
    priority: priority !== 'all' ? [priority] : undefined,
    page, page_size: PAGE_SIZE,
  }), [search, status, priority, page]);

  const { data, isLoading, error, refetch } = useTickets(filters);
  const { data: directory } = useDirectoryData();
  const { data: accounts } = useAccountsWithContacts();

  const dirMap = new Map(directory?.map((u) => [u.userId, u.displayName]) ?? []);
  const accountMap = new Map(accounts?.map((a) => [a.id, a.name]) ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Support tickets are managed under the unified Tickets system.</p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Support Ticket
        </Button>
      </div>

      <TicketsFilterBar
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }}
        status={status} onStatusChange={(v) => { setStatus(v); setPage(1); }}
        ticketType="all" onTypeChange={() => { /* hidden in support tab */ }}
        priority={priority} onPriorityChange={(v) => { setPriority(v); setPage(1); }}
        hideTypeFilter
        onReset={() => { setSearch(''); setStatus('all'); setPriority('all'); setPage(1); }}
      />

      {error ? (
        <PageError message="Failed to load support tickets." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (data?.tickets.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <TicketIcon className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">No support tickets</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.tickets.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setSelectedId(t.id)}>
                  <TableCell className="font-medium max-w-xs truncate">{t.title}</TableCell>
                  <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                  <TableCell><TicketPriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.account_id ? accountMap.get(t.account_id) ?? '—' : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.assigned_to ? dirMap.get(t.assigned_to) ?? '—' : 'Unassigned'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(t.updated_at), 'MMM d, HH:mm')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddTicketDialog open={addOpen} onOpenChange={setAddOpen} defaultType="support" />
      <TicketDetailSheet
        ticketId={selectedId}
        open={!!selectedId}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
      />
    </div>
  );
}

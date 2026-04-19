import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Plus, Loader2, Ticket as TicketIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { useTickets, type TicketStatus, type TicketType, type TicketPriority } from '@/hooks/useTickets';
import { TicketsFilterBar } from '@/components/tickets/TicketsFilterBar';
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/tickets/TicketStatusBadge';
import { AddTicketDialog } from '@/components/tickets/AddTicketDialog';
import { TicketDetailSheet } from '@/components/tickets/TicketDetailSheet';
import { PageError } from '@/components/PageError';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { useAccountsWithContacts } from '@/hooks/useAccountsContacts';

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TicketStatus | 'all'>('all');
  const [ticketType, setTicketType] = useState<TicketType | 'all'>('all');
  const [priority, setPriority] = useState<TicketPriority | 'all'>('all');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = useMemo(() => ({
    search: search || undefined,
    status: status !== 'all' ? [status] : undefined,
    ticket_type: ticketType !== 'all' ? [ticketType] : undefined,
    priority: priority !== 'all' ? [priority] : undefined,
    page,
    page_size: PAGE_SIZE,
  }), [search, status, ticketType, priority, page]);

  const { data, isLoading, error, refetch } = useTickets(filters);
  const { data: directory } = useDirectoryData();
  const { data: accounts } = useAccountsWithContacts();

  const dirMap = new Map(directory?.map((u) => [u.userId, u.displayName]) ?? []);
  const accountMap = new Map(accounts?.map((a) => [a.id, a.name]) ?? []);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setSearch(''); setStatus('all'); setTicketType('all'); setPriority('all'); setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TicketIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Tickets</h1>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Ticket
        </Button>
      </div>

      <TicketsFilterBar
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }}
        status={status} onStatusChange={(v) => { setStatus(v); setPage(1); }}
        ticketType={ticketType} onTypeChange={(v) => { setTicketType(v); setPage(1); }}
        priority={priority} onPriorityChange={(v) => { setPriority(v); setPage(1); }}
        onReset={resetFilters}
      />

      {error ? (
        <PageError message="Failed to load tickets." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (data?.tickets.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <TicketIcon className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">No tickets found</p>
          <p className="text-sm mt-1">Try adjusting your filters or create a new ticket.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.tickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(t.id)}
                  >
                    <TableCell className="font-medium max-w-xs truncate">{t.title}</TableCell>
                    <TableCell><TicketStatusBadge status={t.status} /></TableCell>
                    <TableCell><TicketPriorityBadge priority={t.priority} /></TableCell>
                    <TableCell className="text-sm capitalize">{t.ticket_type.replace('_', ' ')}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.account_id ? accountMap.get(t.account_id) ?? '—' : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.assigned_to ? dirMap.get(t.assigned_to) ?? '—' : 'Unassigned'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(t.updated_at), 'MMM d, HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <AddTicketDialog open={addOpen} onOpenChange={setAddOpen} />
      <TicketDetailSheet
        ticketId={selectedId}
        open={!!selectedId}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
      />
    </div>
  );
}

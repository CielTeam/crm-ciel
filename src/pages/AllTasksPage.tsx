import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Loader2, ListChecks, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import { useAllTasks } from '@/hooks/useAllTasks';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { PageError } from '@/components/PageError';

const STATUS_OPTIONS = ['todo','pending_accept','accepted','in_progress','submitted','done','approved','rejected','declined'];
const PRIORITY_OPTIONS = ['low','medium','high','urgent'];
const PAGE_SIZE = 25;

export default function AllTasksPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [priority, setPriority] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const filters = useMemo(() => ({
    search: search || undefined,
    status: status !== 'all' ? [status] : undefined,
    priority: priority !== 'all' ? [priority] : undefined,
    user_id: userFilter !== 'all' ? userFilter : undefined,
    page,
    page_size: PAGE_SIZE,
  }), [search, status, priority, userFilter, page]);

  const { data, isLoading, error, refetch } = useAllTasks(filters);
  const { data: directory } = useDirectoryData();

  const dirMap = new Map(directory?.map((u) => [u.userId, u]) ?? []);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = search || status !== 'all' || priority !== 'all' || userFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ListChecks className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">All Tasks</h1>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9"
          />
        </div>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Assignee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {directory?.map((u) => <SelectItem key={u.userId} value={u.userId}>{u.displayName}</SelectItem>)}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus('all'); setPriority('all'); setUserFilter('all'); setPage(1); }} className="h-9">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {error ? (
        <PageError message="Failed to load tasks." onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (data?.tasks.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ListChecks className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">No tasks found</p>
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
                  <TableHead>Assignee</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.tasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium max-w-xs truncate">{t.title}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{t.status.replace('_', ' ')}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs capitalize">{t.priority}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.assigned_to ? dirMap.get(t.assigned_to)?.displayName ?? t.assigned_to : 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-sm">{t.progress_percent}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.due_date ? format(new Date(t.due_date), 'MMM d, yyyy') : '—'}
                    </TableCell>
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
    </div>
  );
}

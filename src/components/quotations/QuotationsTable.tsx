import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { QUOTATION_STATUSES, type Quotation } from '@/hooks/useQuotations';

interface Props {
  quotations: Quotation[] | undefined;
  isLoading: boolean;
  onView: (q: Quotation) => void;
  onDelete?: (q: Quotation) => void;
  canDelete: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}

function statusBadge(status: string) {
  return QUOTATION_STATUSES.find((s) => s.value === status) || QUOTATION_STATUSES[0];
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function QuotationsTable({
  quotations, isLoading, onView, onDelete, canDelete,
  selectedIds, onToggleSelect, onToggleSelectAll,
}: Props) {
  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading quotations…</div>;
  }
  if (!quotations || quotations.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg text-muted-foreground">
        No quotations found.
      </div>
    );
  }

  const allSelected = quotations.every((q) => selectedIds.has(q.id));

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} aria-label="Select all" />
            </TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead className="text-center">Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotations.map((q) => {
            const sb = statusBadge(q.status);
            return (
              <TableRow
                key={q.id}
                className="cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-stop]')) return;
                  onView(q);
                }}
              >
                <TableCell data-stop onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(q.id)}
                    onCheckedChange={() => onToggleSelect(q.id)}
                    aria-label={`Select ${q.reference}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs font-medium text-foreground">
                  {q.reference || q.id.slice(0, 8)}
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  {q.account?.name || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={q.requester?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {initials(q.requester?.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{q.requester?.display_name || '—'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center text-sm">{q.item_count ?? 0}</TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {formatMoney(q.total_amount, q.currency)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${sb.tone}`}>{sb.label}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(q.created_at), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-right" data-stop onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onView(q)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete && onDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDelete(q)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

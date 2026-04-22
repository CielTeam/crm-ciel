import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { QUOTATION_STATUSES, type QuotationFilters } from '@/hooks/useQuotations';
import { useAccountsWithContacts } from '@/hooks/useAccountsContacts';
import { useDirectoryData } from '@/hooks/useDirectoryData';

interface Props {
  filters: QuotationFilters;
  onChange: (f: QuotationFilters) => void;
}

export function QuotationsFilterBar({ filters, onChange }: Props) {
  const { data: accounts } = useAccountsWithContacts();
  const { data: users } = useDirectoryData();

  const update = (patch: Partial<QuotationFilters>) => onChange({ ...filters, ...patch });
  const hasActive = !!(filters.search || filters.status || filters.account_id || filters.requested_by || filters.from || filters.to);

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border rounded-lg bg-card">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8 h-9"
          placeholder="Search by reference…"
          value={filters.search || ''}
          onChange={(e) => update({ search: e.target.value })}
        />
      </div>

      <Select value={filters.status || 'all'} onValueChange={(v) => update({ status: v === 'all' ? '' : (v as QuotationFilters['status']) })}>
        <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {QUOTATION_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.account_id || 'all'} onValueChange={(v) => update({ account_id: v === 'all' ? '' : v })}>
        <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Account" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {(accounts || []).map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.requested_by || 'all'} onValueChange={(v) => update({ requested_by: v === 'all' ? '' : v })}>
        <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Requested by" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All requesters</SelectItem>
          {(users || []).map((u) => (
            <SelectItem key={u.userId} value={u.userId}>{u.displayName}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        className="h-9 w-[150px]"
        value={filters.from || ''}
        onChange={(e) => update({ from: e.target.value })}
        aria-label="From date"
      />
      <Input
        type="date"
        className="h-9 w-[150px]"
        value={filters.to || ''}
        onChange={(e) => update({ to: e.target.value })}
        aria-label="To date"
      />

      {hasActive && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          <X className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>
      )}
    </div>
  );
}

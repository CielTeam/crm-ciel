import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, Plus, Search, TrendingUp, DollarSign, Download } from 'lucide-react';
import { useOpportunities, OPPORTUNITY_STAGES, type Opportunity } from '@/hooks/useOpportunities';
import { useAccounts } from '@/hooks/useAccountsContacts';
import { OpportunityDetailSheet } from '@/components/opportunities/OpportunityDetailSheet';
import { AddOpportunityDialog } from '@/components/opportunities/AddOpportunityDialog';
import { rowsToCsv, downloadCsv, buildFilterSummary, buildExportFilename } from '@/lib/csv';

export default function OpportunitiesPage() {
  const { data: opportunities, isLoading } = useOpportunities();
  const { data: accounts } = useAccounts();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const accountMap = useMemo(() => {
    const m: Record<string, string> = {};
    (accounts || []).forEach(a => { m[a.id] = a.name; });
    return m;
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (opportunities || []).filter(o =>
      o.name.toLowerCase().includes(q) ||
      (o.account_id && accountMap[o.account_id]?.toLowerCase().includes(q))
    );
  }, [opportunities, search, accountMap]);

  const totals = useMemo(() => {
    const list = opportunities || [];
    return {
      count: list.length,
      pipeline: list.reduce((s, o) => s + Number(o.estimated_value || 0), 0),
      weighted: list.reduce((s, o) => s + Number(o.weighted_forecast || 0), 0),
    };
  }, [opportunities]);

  const handleExport = () => {
    if (filtered.length === 0) return;
    const headers = ['Name', 'Account', 'Stage', 'Value', 'Currency', 'Weighted forecast', 'Probability %', 'Close date', 'Created'];
    const rows = filtered.map(o => [
      o.name,
      o.account_id ? accountMap[o.account_id] || '' : '',
      o.stage,
      o.estimated_value ?? '',
      o.currency,
      o.weighted_forecast ?? '',
      o.probability_percent,
      o.expected_close_date || '',
      o.created_at.slice(0, 10),
    ]);
    const summary = buildFilterSummary([search]);
    downloadCsv(rowsToCsv(headers, rows), buildExportFilename('opportunities', summary));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Opportunities</h1>
          <p className="text-sm text-muted-foreground">Sales pipeline tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Opportunity
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Briefcase className="h-5 w-5 text-primary" />
          <div><p className="text-2xl font-bold">{totals.count}</p><p className="text-xs text-muted-foreground">Open opportunities</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-[hsl(var(--success))]" />
          <div><p className="text-2xl font-bold">${totals.pipeline.toLocaleString()}</p><p className="text-xs text-muted-foreground">Pipeline value</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-[hsl(var(--info))]" />
          <div><p className="text-2xl font-bold">${totals.weighted.toLocaleString()}</p><p className="text-xs text-muted-foreground">Weighted forecast</p></div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search opportunities..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No opportunities found.</CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Weighted</TableHead>
                <TableHead className="text-right">Probability</TableHead>
                <TableHead>Close date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => {
                const stage = OPPORTUNITY_STAGES.find(s => s.value === o.stage);
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o)}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="text-sm">{o.account_id ? accountMap[o.account_id] || '—' : '—'}</TableCell>
                    <TableCell>{stage && <Badge variant="outline" className={stage.color}>{stage.label}</Badge>}</TableCell>
                    <TableCell className="text-right text-sm">{o.estimated_value ? `${o.currency} ${Number(o.estimated_value).toLocaleString()}` : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{o.weighted_forecast ? `${o.currency} ${Number(o.weighted_forecast).toLocaleString()}` : '—'}</TableCell>
                    <TableCell className="text-right text-sm">{o.probability_percent}%</TableCell>
                    <TableCell className="text-sm">{o.expected_close_date || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <OpportunityDetailSheet opportunity={selected} open={!!selected} onOpenChange={o => !o && setSelected(null)} />
      <AddOpportunityDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

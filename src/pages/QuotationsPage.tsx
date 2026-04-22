import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { QuotationsFilterBar } from '@/components/quotations/QuotationsFilterBar';
import { QuotationsTable } from '@/components/quotations/QuotationsTable';
import { QuotationDetailSheet } from '@/components/quotations/QuotationDetailSheet';
import {
  useQuotations,
  useDeleteQuotation,
  useExportQuotationsCsv,
  type Quotation,
  type QuotationFilters,
} from '@/hooks/useQuotations';
import { useAuth } from '@/contexts/AuthContext';
import { downloadCsv, buildExportFilename } from '@/lib/csv';

export default function QuotationsPage() {
  const { roles } = useAuth();
  const isAccountingHead = roles.includes('head_of_accounting');

  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<QuotationFilters>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: quotations, isLoading } = useQuotations(filters);
  const deleteQuotation = useDeleteQuotation();
  const exportCsv = useExportQuotationsCsv();

  // Open from notification ?open=<id>
  useEffect(() => {
    const id = searchParams.get('open');
    if (id) {
      setActiveId(id);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (!quotations) return;
    setSelectedIds((prev) => prev.size === quotations.length ? new Set() : new Set(quotations.map((q) => q.id)));
  }, [quotations]);

  const handleExport = async () => {
    try {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const res = await exportCsv.mutateAsync({ ids });
      downloadCsv(res.csv, buildExportFilename('quotations', selectedIds.size > 0 ? `selected-${selectedIds.size}` : ''));
    } catch { /* toast handled */ }
  };

  const handleDelete = (q: Quotation) => {
    if (!confirm(`Delete quotation ${q.reference}?`)) return;
    deleteQuotation.mutate(q.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {quotations ? `${quotations.length} quotation${quotations.length !== 1 ? 's' : ''}` : 'Loading…'}
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exportCsv.isPending || !quotations || quotations.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {exportCsv.isPending ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </div>

      <QuotationsFilterBar filters={filters} onChange={setFilters} />

      <QuotationsTable
        quotations={quotations}
        isLoading={isLoading}
        onView={(q) => setActiveId(q.id)}
        onDelete={isAccountingHead ? handleDelete : undefined}
        canDelete={isAccountingHead}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
      />

      <QuotationDetailSheet
        quotationId={activeId}
        open={!!activeId}
        onOpenChange={(v) => !v && setActiveId(null)}
      />
    </div>
  );
}

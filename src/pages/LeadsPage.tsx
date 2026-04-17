import { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Download, LayoutGrid, Table2, BarChart3 } from 'lucide-react';
import { LeadStatsCards } from '@/components/leads/LeadStatsCards';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadsKanbanView } from '@/components/leads/LeadsKanbanView';
import { LeadsAnalyticsView } from '@/components/leads/LeadsAnalyticsView';
import { LeadsBulkActions } from '@/components/leads/LeadsBulkActions';
import { LeadDetailSheet } from '@/components/leads/LeadDetailSheet';
import { AddLeadDialog } from '@/components/leads/AddLeadDialog';
import { EditLeadDialog } from '@/components/leads/EditLeadDialog';
import { LeadsFilterBar, type LeadFilters } from '@/components/leads/LeadsFilterBar';
import { useLeadsWithServices, LEAD_STAGES, type Lead } from '@/hooks/useLeads';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export default function LeadsPage() {
  const [tab, setTab] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'analytics'>('table');
  const [addOpen, setAddOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<LeadFilters>({});

  const stageFilter = tab === 'all' ? undefined : tab;
  const { data: leads, isLoading } = useLeadsWithServices(undefined, stageFilter, filters as Record<string, unknown>);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (!leads) return;
    setSelectedIds(prev => prev.size === leads.length ? new Set() : new Set(leads.map(l => l.id)));
  }, [leads]);

  const handleExport = () => {
    if (!leads || leads.length === 0) return;
    const headers = ['Company', 'Contact', 'Email', 'Phone', 'Stage', 'Status', 'Source', 'Est. Value', 'Probability', 'Services', 'Created'];
    const rows = leads.map(l => [
      l.company_name, l.contact_name, l.contact_email || '', l.contact_phone || '',
      l.stage, l.status, l.source || '', l.estimated_value?.toString() || '',
      l.probability_percent?.toString() || '0',
      (l.services || []).map(s => s.service_name).join('; '), l.created_at.slice(0, 10),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads ? `${leads.length} leads` : 'Loading...'} · Pipeline tracking, services & forecasting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as typeof viewMode)}>
            <ToggleGroupItem value="table" aria-label="Table view" className="px-2.5">
              <Table2 className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="kanban" aria-label="Kanban view" className="px-2.5">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="analytics" aria-label="Analytics view" className="px-2.5">
              <BarChart3 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" onClick={handleExport} disabled={!leads || leads.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />New Lead</Button>
        </div>
      </div>

      <LeadStatsCards />

      {selectedIds.size > 0 && leads && (
        <LeadsBulkActions
          selectedIds={selectedIds}
          leads={leads}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {viewMode === 'analytics' ? (
        <LeadsAnalyticsView leads={leads} />
      ) : viewMode === 'kanban' ? (
        <LeadsKanbanView leads={leads} onView={setViewLead} />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {LEAD_STAGES.map(s => (
              <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            <LeadsTable
              leads={leads}
              isLoading={isLoading}
              onView={setViewLead}
              onEdit={setEditLead}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
            />
          </TabsContent>
        </Tabs>
      )}

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditLeadDialog open={!!editLead} onOpenChange={(v) => !v && setEditLead(null)} lead={editLead} />
      <LeadDetailSheet open={!!viewLead} onOpenChange={(v) => !v && setViewLead(null)} lead={viewLead} />
    </div>
  );
}

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { LeadStatsCards } from '@/components/leads/LeadStatsCards';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailSheet } from '@/components/leads/LeadDetailSheet';
import { AddLeadDialog } from '@/components/leads/AddLeadDialog';
import { EditLeadDialog } from '@/components/leads/EditLeadDialog';
import { useLeadsWithServices, type Lead } from '@/hooks/useLeads';

export default function LeadsPage() {
  const [tab, setTab] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);

  const statusFilter = tab === 'all' ? undefined : tab;
  const { data: leads, isLoading } = useLeadsWithServices(statusFilter);

  const handleExport = () => {
    if (!leads || leads.length === 0) return;
    const headers = ['Company', 'Contact', 'Email', 'Phone', 'Status', 'Source', 'Services', 'Created'];
    const rows = leads.map(l => [
      l.company_name,
      l.contact_name,
      l.contact_email || '',
      l.contact_phone || '',
      l.status,
      l.source || '',
      (l.services || []).map(s => s.service_name).join('; '),
      l.created_at.slice(0, 10),
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
            {leads ? `${leads.length} leads` : 'Loading...'} · Track clients, services & renewals
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={!leads || leads.length === 0}>
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />New Lead</Button>
        </div>
      </div>

      <LeadStatsCards />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="potential">Potential</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
          <TabsTrigger value="lost">Lost</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <LeadsTable leads={leads} isLoading={isLoading} onView={setViewLead} onEdit={setEditLead} />
        </TabsContent>
      </Tabs>

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditLeadDialog open={!!editLead} onOpenChange={(v) => !v && setEditLead(null)} lead={editLead} />
      <LeadDetailSheet open={!!viewLead} onOpenChange={(v) => !v && setViewLead(null)} lead={viewLead} />
    </div>
  );
}

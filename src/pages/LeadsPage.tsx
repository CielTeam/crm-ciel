import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { LeadStatsCards } from '@/components/leads/LeadStatsCards';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailSheet } from '@/components/leads/LeadDetailSheet';
import { AddLeadDialog } from '@/components/leads/AddLeadDialog';
import { EditLeadDialog } from '@/components/leads/EditLeadDialog';
import { useLeadsList, type Lead } from '@/hooks/useLeads';

export default function LeadsPage() {
  const [tab, setTab] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);

  const statusFilter = tab === 'all' ? undefined : tab;
  const { data: leads, isLoading } = useLeadsList(statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Leads</h1>
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />New Lead</Button>
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

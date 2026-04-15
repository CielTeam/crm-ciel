import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Trash2, UserPlus, ArrowRight, Download, X, CheckSquare } from 'lucide-react';
import { type Lead, type LeadStage, LEAD_STAGES, useBulkChangeStage, useBulkAssignOwner, useBulkDelete } from '@/hooks/useLeads';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { LostReasonDialog } from './LostReasonDialog';
import { toast } from 'sonner';

interface Props {
  selectedIds: Set<string>;
  leads: Lead[];
  onClearSelection: () => void;
}

export function LeadsBulkActions({ selectedIds, leads, onClearSelection }: Props) {
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const bulkChangeStage = useBulkChangeStage();
  const bulkAssignOwner = useBulkAssignOwner();
  const bulkDelete = useBulkDelete();
  const { data: profiles } = useDirectoryData();

  const ids = Array.from(selectedIds);

  const handleStageChange = (stage: LeadStage) => {
    if (stage === 'lost') {
      setLostDialogOpen(true);
      return;
    }
    bulkChangeStage.mutate({ ids, stage }, { onSuccess: () => { toast.success(`${ids.length} leads moved to ${stage}`); onClearSelection(); } });
  };

  const handleAssign = (userId: string) => {
    bulkAssignOwner.mutate({ ids, assigned_to: userId }, { onSuccess: () => { toast.success(`${ids.length} leads reassigned`); onClearSelection(); } });
  };

  const handleDelete = () => {
    if (!confirm(`Delete ${ids.length} leads? This action is soft-delete.`)) return;
    bulkDelete.mutate({ ids }, { onSuccess: () => { toast.success(`${ids.length} leads deleted`); onClearSelection(); } });
  };

  const handleExport = () => {
    const selected = leads.filter(l => selectedIds.has(l.id));
    const headers = ['Company', 'Contact', 'Email', 'Phone', 'Stage', 'Est. Value', 'Probability', 'Source', 'Created'];
    const rows = selected.map(l => [
      l.company_name, l.contact_name, l.contact_email || '', l.contact_phone || '',
      l.stage, l.estimated_value?.toString() || '', l.probability_percent.toString(),
      l.source || '', l.created_at.slice(0, 10),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${ids.length}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ids.length} leads`);
  };

  // Get assignable users (people with leads-access roles)
  const assignableUsers = (profiles || []).filter(p => p.role && ['chairman', 'vice_president', 'head_of_operations', 'sales_lead', 'sales_employee'].includes(p.role));

  if (selectedIds.size === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <CheckSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><ArrowRight className="h-3.5 w-3.5 mr-1.5" />Change Stage</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {LEAD_STAGES.map(s => (
              <DropdownMenuItem key={s.value} onClick={() => handleStageChange(s.value)}>
                <Badge variant="outline" className={`mr-2 text-[10px] ${s.color}`}>{s.label}</Badge>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><UserPlus className="h-3.5 w-3.5 mr-1.5" />Assign</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {assignableUsers.map(u => (
              <DropdownMenuItem key={u.userId} onClick={() => handleAssign(u.userId)}>
                {u.displayName}
              </DropdownMenuItem>
            ))}
            {assignableUsers.length === 0 && (
              <DropdownMenuItem disabled>No users available</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1.5" />Export
        </Button>

        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
        </Button>

        <Button variant="ghost" size="sm" onClick={onClearSelection} className="ml-auto">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <LostReasonDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        isPending={bulkChangeStage.isPending}
        onConfirm={(reason, notes) => {
          bulkChangeStage.mutate({ ids, stage: 'lost' as LeadStage, lost_reason_code: reason, lost_notes: notes }, {
            onSuccess: () => { setLostDialogOpen(false); onClearSelection(); },
          });
        }}
      />
    </>
  );
}

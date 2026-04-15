import { useState, useMemo } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, DollarSign, GripVertical } from 'lucide-react';
import { type Lead, type LeadStage, LEAD_STAGES, useChangeStage, computeLeadScore } from '@/hooks/useLeads';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { LostReasonDialog } from './LostReasonDialog';
import { format } from 'date-fns';

const PIPELINE_STAGES = LEAD_STAGES.filter(s => s.value !== 'lost');

interface KanbanCardProps {
  lead: Lead;
  onView: (lead: Lead) => void;
  getOwnerName: (id: string | null) => string | null;
}

function KanbanCard({ lead, onView, getOwnerName }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const { band } = computeLeadScore(lead);
  const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();
  const bandColors = { hot: 'bg-destructive/10 text-destructive', warm: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]', cold: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]' };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="cursor-pointer hover:shadow-md transition-shadow border"
      onClick={() => onView(lead)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{lead.company_name}</p>
            <p className="text-xs text-muted-foreground truncate">{lead.contact_name}</p>
          </div>
          <div {...attributes} {...listeners} className="cursor-grab shrink-0 text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {lead.estimated_value ? (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              <DollarSign className="h-3 w-3 mr-0.5" />
              {Number(lead.estimated_value).toLocaleString()}
            </Badge>
          ) : null}
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${bandColors[band]}`}>{band}</Badge>
          {isOverdue && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/30">
              <AlertTriangle className="h-3 w-3 mr-0.5" />Overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          {lead.assigned_to ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[8px] bg-muted">
                      {(getOwnerName(lead.assigned_to) || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">{getOwnerName(lead.assigned_to)}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : <span />}
          {lead.next_follow_up_at && (
            <span className={`text-[10px] ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {format(new Date(lead.next_follow_up_at), 'MMM d')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  leads: Lead[] | undefined;
  onView: (lead: Lead) => void;
}

export function LeadsKanbanView({ leads, onView }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lostDialogLeadId, setLostDialogLeadId] = useState<string | null>(null);
  const changeStage = useChangeStage();
  const { data: profiles } = useDirectoryData();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const getOwnerName = (userId: string | null) => {
    if (!userId) return null;
    const p = profiles?.find(pr => pr.userId === userId);
    return p?.displayName || userId.slice(0, 8);
  };

  const columns = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of PIPELINE_STAGES) map[s.value] = [];
    for (const l of (leads || [])) {
      if (l.stage === 'lost') continue; // Show lost in separate section if needed
      if (map[l.stage]) map[l.stage].push(l);
    }
    return map;
  }, [leads]);

  const lostLeads = useMemo(() => (leads || []).filter(l => l.stage === 'lost'), [leads]);
  const activeLead = activeId ? (leads || []).find(l => l.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const lead = (leads || []).find(l => l.id === leadId);
    if (!lead) return;

    // Find target stage from the droppable container
    let targetStage: LeadStage | null = null;
    for (const s of PIPELINE_STAGES) {
      if (over.id === `column-${s.value}` || columns[s.value]?.some(l => l.id === over.id)) {
        targetStage = s.value;
        break;
      }
    }

    if (!targetStage || targetStage === lead.stage) return;

    if (targetStage === 'lost') {
      setLostDialogLeadId(leadId);
      return;
    }

    changeStage.mutate({ id: leadId, stage: targetStage });
  };

  const columnTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [stage, stageLeads] of Object.entries(columns)) {
      totals[stage] = stageLeads.reduce((sum, l) => sum + Number(l.estimated_value || 0), 0);
    }
    return totals;
  }, [columns]);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map(stage => (
            <div key={stage.value} className="min-w-[240px] w-[240px] flex-shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${stage.color}`}>{stage.label}</Badge>
                  <span className="text-xs text-muted-foreground font-medium">{columns[stage.value].length}</span>
                </div>
                {columnTotals[stage.value] > 0 && (
                  <span className="text-[10px] text-muted-foreground font-mono">${columnTotals[stage.value].toLocaleString()}</span>
                )}
              </div>
              <ScrollArea className="h-[calc(100vh-320px)]">
                <SortableContext id={`column-${stage.value}`} items={columns[stage.value].map(l => l.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 min-h-[60px] p-1" id={`column-${stage.value}`}>
                    {columns[stage.value].length === 0 && (
                      <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                        Drop leads here
                      </div>
                    )}
                    {columns[stage.value].map(lead => (
                      <KanbanCard key={lead.id} lead={lead} onView={onView} getOwnerName={getOwnerName} />
                    ))}
                  </div>
                </SortableContext>
              </ScrollArea>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeLead && (
            <Card className="w-[240px] shadow-lg border-primary/50">
              <CardContent className="p-3">
                <p className="text-sm font-semibold text-foreground">{activeLead.company_name}</p>
                <p className="text-xs text-muted-foreground">{activeLead.contact_name}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {lostLeads.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">Lost ({lostLeads.length})</p>
          <div className="flex gap-2 flex-wrap">
            {lostLeads.slice(0, 10).map(lead => (
              <Card key={lead.id} className="cursor-pointer hover:shadow-sm border opacity-60" onClick={() => onView(lead)}>
                <CardContent className="p-2 px-3">
                  <p className="text-xs font-medium text-foreground">{lead.company_name}</p>
                </CardContent>
              </Card>
            ))}
            {lostLeads.length > 10 && <span className="text-xs text-muted-foreground self-center">+{lostLeads.length - 10} more</span>}
          </div>
        </div>
      )}

      <LostReasonDialog
        open={!!lostDialogLeadId}
        onOpenChange={(v) => !v && setLostDialogLeadId(null)}
        isPending={changeStage.isPending}
        onConfirm={(reason, notes) => {
          if (lostDialogLeadId) {
            changeStage.mutate({ id: lostDialogLeadId, stage: 'lost', lost_reason_code: reason, lost_notes: notes }, {
              onSuccess: () => setLostDialogLeadId(null),
            });
          }
        }}
      />
    </>
  );
}

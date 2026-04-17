import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Eye, Search, ChevronDown, ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { type Lead, type LeadService, type LeadStage, useDeleteLead, useChangeStage, LEAD_STAGES } from '@/hooks/useLeads';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { LostReasonDialog } from './LostReasonDialog';

function expiryVariant(expiry: string): string {
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) return 'bg-destructive/15 text-destructive border-destructive/40';
  if (days <= 7) return 'bg-destructive/10 text-destructive border-destructive/30';
  if (days <= 30) return 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30';
  return 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30';
}

function ServicePills({ services }: { services: LeadService[] }) {
  if (!services || services.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1">
        {services.slice(0, 3).map((s) => (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${expiryVariant(s.expiry_date)}`}>{s.service_name}</Badge>
            </TooltipTrigger>
            <TooltipContent><p className="text-xs">{s.service_name} — Exp: {format(new Date(s.expiry_date), 'MMM d, yyyy')}</p></TooltipContent>
          </Tooltip>
        ))}
        {services.length > 3 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{services.length - 3}</Badge>}
      </div>
    </TooltipProvider>
  );
}

function ServiceSubTable({ services }: { services: LeadService[] }) {
  return (
    <div className="bg-muted/30 p-3 rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs h-8">Service</TableHead>
            <TableHead className="text-xs h-8">Start Date</TableHead>
            <TableHead className="text-xs h-8">Expiry Date</TableHead>
            <TableHead className="text-xs h-8">Status</TableHead>
            <TableHead className="text-xs h-8">Days Left</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((s) => {
            const days = differenceInDays(new Date(s.expiry_date), new Date());
            return (
              <TableRow key={s.id} className="hover:bg-muted/50">
                <TableCell className="py-1.5 font-medium text-sm text-foreground">{s.service_name}</TableCell>
                <TableCell className="py-1.5 text-sm text-muted-foreground">{s.start_date ? format(new Date(s.start_date), 'MMM d, yyyy') : '—'}</TableCell>
                <TableCell className="py-1.5 text-sm text-muted-foreground">{format(new Date(s.expiry_date), 'MMM d, yyyy')}</TableCell>
                <TableCell className="py-1.5"><Badge variant="outline" className="text-[10px]">{s.status}</Badge></TableCell>
                <TableCell className="py-1.5"><Badge variant="outline" className={`text-[10px] ${expiryVariant(s.expiry_date)}`}>{days < 0 ? 'Expired' : `${days}d`}</Badge></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const SCORE_COLORS = { hot: 'bg-destructive/10 text-destructive border-destructive/30', warm: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30', cold: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30' };

interface Props {
  leads: Lead[] | undefined;
  isLoading: boolean;
  onView: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export function LeadsTable({ leads, isLoading, onView, onEdit, selectedIds, onToggleSelect, onToggleSelectAll }: Props) {
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lostDialogLead, setLostDialogLead] = useState<Lead | null>(null);
  const deleteLead = useDeleteLead();
  const changeStage = useChangeStage();
  const { data: profiles } = useDirectoryData();

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const getOwnerName = (userId: string | null) => {
    if (!userId) return null;
    const p = profiles?.find(pr => pr.userId === userId);
    return p?.displayName || userId.slice(0, 8);
  };

  const getOwnerInitials = (userId: string | null) => {
    const name = getOwnerName(userId);
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  const handleStageChange = (lead: Lead, newStage: LeadStage) => {
    if (newStage === 'lost') {
      setLostDialogLead(lead);
    } else {
      changeStage.mutate({ id: lead.id, stage: newStage });
    }
  };

  const filtered = (leads || []).filter(l =>
    l.company_name.toLowerCase().includes(search.toLowerCase()) ||
    l.contact_name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <>
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  {onToggleSelectAll && (
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds?.size === filtered.length}
                      onCheckedChange={onToggleSelectAll}
                    />
                  )}
                </TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Services</TableHead>
                <TableHead className="text-right">Est. Value</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No leads found</TableCell></TableRow>
              ) : filtered.map((lead) => {
                const isExpanded = expandedIds.has(lead.id);
                const services = lead.services || [];
                const stageConfig = LEAD_STAGES.find(s => s.value === lead.stage);
                const band = (lead.score_band || 'cold') as 'hot' | 'warm' | 'cold';
                const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();

                return (
                  <TooltipProvider key={lead.id}>
                    <TableRow className="group">
                      <TableCell className="pr-0">
                        {onToggleSelect && (
                          <Checkbox
                            checked={selectedIds?.has(lead.id) || false}
                            onCheckedChange={() => onToggleSelect(lead.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </TableCell>
                      <TableCell className="pr-0">
                        {services.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(lead.id)}>
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-foreground cursor-pointer" onClick={() => onView(lead)}>
                        <div>{lead.company_name}</div>
                        {lead.source && <div className="text-[10px] text-muted-foreground">{lead.source}</div>}
                      </TableCell>
                      <TableCell className="cursor-pointer" onClick={() => onView(lead)}>
                        <div className="text-sm text-foreground">{lead.contact_name}</div>
                        {lead.contact_email && <div className="text-xs text-muted-foreground">{lead.contact_email}</div>}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Badge variant="outline" className={`cursor-pointer ${stageConfig?.color || ''}`}>
                              {stageConfig?.label || lead.stage}
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {LEAD_STAGES.map(s => (
                              <DropdownMenuItem key={s.value} onClick={() => handleStageChange(lead, s.value)} disabled={s.value === lead.stage}>
                                <Badge variant="outline" className={`mr-2 text-[10px] ${s.color}`}>{s.label}</Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        {lead.assigned_to ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="text-[10px] bg-muted">{getOwnerInitials(lead.assigned_to)}</AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">{getOwnerName(lead.assigned_to)}</p></TooltipContent>
                          </Tooltip>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><ServicePills services={services} /></TableCell>
                      <TableCell className="text-right text-sm">
                        {lead.estimated_value ? (
                          <span className="text-foreground font-medium">{lead.currency} {Number(lead.estimated_value).toLocaleString()}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {lead.next_follow_up_at ? (
                          <div className="flex items-center gap-1">
                            {isOverdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                            <span className={`text-xs ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              {format(new Date(lead.next_follow_up_at), 'MMM d')}
                            </span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${SCORE_COLORS[band]}`}>{band}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onView(lead)}><Eye className="mr-2 h-4 w-4" />View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEdit(lead)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteLead.mutate(lead.id)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {isExpanded && services.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="p-0 bg-muted/20">
                          <div className="px-4 py-2"><ServiceSubTable services={services} /></div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TooltipProvider>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <LostReasonDialog
        open={!!lostDialogLead}
        onOpenChange={(v) => !v && setLostDialogLead(null)}
        isPending={changeStage.isPending}
        onConfirm={(reason, notes) => {
          if (lostDialogLead) {
            changeStage.mutate({ id: lostDialogLead.id, stage: 'lost', lost_reason_code: reason, lost_notes: notes }, {
              onSuccess: () => setLostDialogLead(null),
            });
          }
        }}
      />
    </>
  );
}

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Eye, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { type Lead, type LeadService, useDeleteLead } from '@/hooks/useLeads';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const STATUS_COLORS: Record<string, string> = {
  potential: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
  active: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  inactive: 'bg-muted text-muted-foreground border-border',
  lost: 'bg-destructive/10 text-destructive border-destructive/30',
};

function expiryVariant(expiry: string): string {
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) return 'bg-destructive/15 text-destructive border-destructive/40';
  if (days <= 7) return 'bg-destructive/10 text-destructive border-destructive/30';
  if (days <= 30) return 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30';
  return 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30';
}

function ServicePills({ services }: { services: LeadService[] }) {
  if (!services || services.length === 0) {
    return <span className="text-xs text-muted-foreground">No services</span>;
  }
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1">
        {services.slice(0, 4).map((s) => {
          const days = differenceInDays(new Date(s.expiry_date), new Date());
          const label = days < 0 ? 'Expired' : `${days}d`;
          return (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${expiryVariant(s.expiry_date)}`}>
                  {s.service_name}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{s.service_name}</p>
                <p className="text-xs text-muted-foreground">Expires: {format(new Date(s.expiry_date), 'MMM d, yyyy')} ({label})</p>
                {s.start_date && <p className="text-xs text-muted-foreground">Start: {format(new Date(s.start_date), 'MMM d, yyyy')}</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {services.length > 4 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{services.length - 4}</Badge>
        )}
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
                <TableCell className="py-1.5">
                  <span className="font-medium text-foreground text-sm">{s.service_name}</span>
                  {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                </TableCell>
                <TableCell className="py-1.5 text-sm text-muted-foreground">
                  {s.start_date ? format(new Date(s.start_date), 'MMM d, yyyy') : '—'}
                </TableCell>
                <TableCell className="py-1.5 text-sm text-muted-foreground">
                  {format(new Date(s.expiry_date), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="py-1.5">
                  <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                </TableCell>
                <TableCell className="py-1.5">
                  <Badge variant="outline" className={`text-[10px] ${expiryVariant(s.expiry_date)}`}>
                    {days < 0 ? 'Expired' : `${days}d left`}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface Props {
  leads: Lead[] | undefined;
  isLoading: boolean;
  onView: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
}

export function LeadsTable({ leads, isLoading, onView, onEdit }: Props) {
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const deleteLead = useDeleteLead();

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = (leads || []).filter(l =>
    l.company_name.toLowerCase().includes(search.toLowerCase()) ||
    l.contact_name.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search leads..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Services / Solutions</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No leads found</TableCell></TableRow>
            ) : filtered.map((lead) => {
              const isExpanded = expandedIds.has(lead.id);
              const services = lead.services || [];
              return (
                <>
                  <TableRow key={lead.id} className="group">
                    <TableCell className="pr-0">
                      {services.length > 0 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleExpand(lead.id)}>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground cursor-pointer" onClick={() => onView(lead)}>{lead.company_name}</TableCell>
                    <TableCell className="cursor-pointer" onClick={() => onView(lead)}>
                      <div><span className="text-sm text-foreground">{lead.contact_name}</span></div>
                      {lead.contact_email && <div className="text-xs text-muted-foreground">{lead.contact_email}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_COLORS[lead.status] || ''}>{lead.status}</Badge></TableCell>
                    <TableCell>
                      <ServicePills services={services} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{lead.source || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{format(new Date(lead.created_at), 'MMM d, yyyy')}</TableCell>
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
                      <TableCell colSpan={8} className="p-0 bg-muted/20">
                        <div className="px-4 py-2">
                          <ServiceSubTable services={services} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

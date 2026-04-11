import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { type Lead, useLeadServices, useDeleteService, useUpdateService } from '@/hooks/useLeads';
import { AddServiceDialog } from './AddServiceDialog';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

function expiryBadge(expiry: string) {
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) return <Badge variant="destructive">Expired</Badge>;
  if (days <= 7) return <Badge variant="destructive">{days}d left</Badge>;
  if (days <= 30) return <Badge className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" variant="outline">{days}d left</Badge>;
  if (days <= 60) return <Badge className="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" variant="outline">{days}d left</Badge>;
  return <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" variant="outline">{days}d left</Badge>;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; }

export function LeadDetailSheet({ open, onOpenChange, lead }: Props) {
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const { data: services, isLoading } = useLeadServices(lead?.id ?? null);
  const deleteService = useDeleteService();
  const updateService = useUpdateService();

  if (!lead) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{lead.company_name}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Contact</span><p className="font-medium text-foreground">{lead.contact_name}</p></div>
              <div><span className="text-muted-foreground">Status</span><p><Badge variant="outline">{lead.status}</Badge></p></div>
              {lead.contact_email && <div><span className="text-muted-foreground">Email</span><p className="text-foreground">{lead.contact_email}</p></div>}
              {lead.contact_phone && <div><span className="text-muted-foreground">Phone</span><p className="text-foreground">{lead.contact_phone}</p></div>}
              {lead.source && <div><span className="text-muted-foreground">Source</span><p className="text-foreground">{lead.source}</p></div>}
              <div><span className="text-muted-foreground">Created</span><p className="text-foreground">{format(new Date(lead.created_at), 'MMM d, yyyy')}</p></div>
            </div>
            {lead.notes && <div className="text-sm"><span className="text-muted-foreground">Notes</span><p className="text-foreground mt-1">{lead.notes}</p></div>}

            <div className="flex items-center justify-between pt-2">
              <h3 className="text-sm font-semibold text-foreground">Services / Solutions</h3>
              <Button size="sm" variant="outline" onClick={() => setAddServiceOpen(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>

            {isLoading ? <Skeleton className="h-24 w-full" /> : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(!services || services.length === 0) ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No services yet</TableCell></TableRow>
                    ) : services.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <span className="font-medium text-foreground">{s.service_name}</span>
                          {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">{format(new Date(s.expiry_date), 'MMM d, yyyy')}</div>
                          {expiryBadge(s.expiry_date)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="cursor-pointer" onClick={() => {
                            const next = s.status === 'active' ? 'renewed' : s.status === 'renewed' ? 'expired' : 'active';
                            updateService.mutate({ id: s.id, lead_id: lead.id, status: next });
                          }}>{s.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteService.mutate({ id: s.id, lead_id: lead.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AddServiceDialog open={addServiceOpen} onOpenChange={setAddServiceOpen} leadId={lead.id} />
    </>
  );
}

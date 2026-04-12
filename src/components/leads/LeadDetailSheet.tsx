import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, RefreshCw, Calendar, Mail, Phone, Building2, Globe, StickyNote, Package, AlertTriangle } from 'lucide-react';
import { type Lead, useLeadServices, useDeleteService, useUpdateService } from '@/hooks/useLeads';
import { AddServiceDialog } from './AddServiceDialog';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

function expiryBadge(expiry: string) {
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) return <Badge variant="destructive">Expired</Badge>;
  if (days <= 7) return <Badge variant="destructive">{days}d left</Badge>;
  if (days <= 30) return <Badge className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" variant="outline">{days}d left</Badge>;
  if (days <= 60) return <Badge className="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" variant="outline">{days}d left</Badge>;
  return <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" variant="outline">{days}d left</Badge>;
}

function validityProgress(start: string | null, expiry: string): number {
  if (!start) return 50;
  const startMs = new Date(start).getTime();
  const expiryMs = new Date(expiry).getTime();
  const nowMs = Date.now();
  const total = expiryMs - startMs;
  if (total <= 0) return 100;
  const elapsed = nowMs - startMs;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

const STATUS_COLORS: Record<string, string> = {
  potential: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30',
  active: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  inactive: 'bg-muted text-muted-foreground border-border',
  lost: 'bg-destructive/10 text-destructive border-destructive/30',
};

interface Props { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; }

export function LeadDetailSheet({ open, onOpenChange, lead }: Props) {
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const { data: services, isLoading } = useLeadServices(lead?.id ?? null);
  const deleteService = useDeleteService();
  const updateService = useUpdateService();

  if (!lead) return null;

  const atRisk = (services || []).filter(s => {
    const d = differenceInDays(new Date(s.expiry_date), new Date());
    return d >= 0 && d <= 30;
  }).length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-xl">{lead.company_name}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            {/* Contact Card */}
            <Card className="border">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{lead.contact_name}</span>
                  <Badge variant="outline" className={`ml-auto ${STATUS_COLORS[lead.status] || ''}`}>{lead.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {lead.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{lead.contact_email}</span>
                    </div>
                  )}
                  {lead.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{lead.contact_phone}</span>
                    </div>
                  )}
                  {lead.source && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-foreground">{lead.source}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Created {format(new Date(lead.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
                {lead.notes && (
                  <div className="flex gap-2 pt-1">
                    <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">{lead.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Services Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-foreground">Services / Solutions</h3>
                <div className="flex gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Package className="h-3 w-3" />
                    {services?.length || 0} total
                  </Badge>
                  {atRisk > 0 && (
                    <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/30">
                      <AlertTriangle className="h-3 w-3" />
                      {atRisk} at risk
                    </Badge>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAddServiceOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />Add Service
              </Button>
            </div>

            {/* Service Cards */}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (!services || services.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No services or solutions added yet. Click "Add Service" to get started.
              </div>
            ) : (
              <div className="space-y-3">
                {services.map((s) => {
                  const days = differenceInDays(new Date(s.expiry_date), new Date());
                  const progress = validityProgress(s.start_date, s.expiry_date);

                  return (
                    <Card key={s.id} className="border">
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-medium text-foreground">{s.service_name}</span>
                            {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            {expiryBadge(s.expiry_date)}
                            <Badge
                              variant="outline"
                              className="cursor-pointer text-[10px]"
                              onClick={() => {
                                const next = s.status === 'active' ? 'renewed' : s.status === 'renewed' ? 'expired' : 'active';
                                updateService.mutate({ id: s.id, lead_id: lead.id, status: next });
                              }}
                            >
                              {s.status}
                            </Badge>
                          </div>
                        </div>

                        {/* Validity Timeline */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{s.start_date ? format(new Date(s.start_date), 'MMM d, yyyy') : 'No start date'}</span>
                            <span>{format(new Date(s.expiry_date), 'MMM d, yyyy')}</span>
                          </div>
                          <Progress
                            value={progress}
                            className="h-1.5"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-muted-foreground">
                            {days < 0 ? `Expired ${Math.abs(days)} days ago` : `${days} days remaining`}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                updateService.mutate({ id: s.id, lead_id: lead.id, status: 'renewed' });
                              }}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />Renew
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteService.mutate({ id: s.id, lead_id: lead.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <AddServiceDialog open={addServiceOpen} onOpenChange={setAddServiceOpen} leadId={lead.id} />
    </>
  );
}

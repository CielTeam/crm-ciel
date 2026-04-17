import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, Trash2, RefreshCw, Mail, Phone, Building2, Globe, StickyNote, Package,
  AlertTriangle, Target, Clock, ListTodo, FileText, Receipt, ArrowRightLeft, Undo2,
  PhoneCall, Users as UsersIcon, ListChecks,
} from 'lucide-react';
import { type Lead, useLeadServices, useDeleteService, useUpdateService, useUnconvertLead, LEAD_STAGES } from '@/hooks/useLeads';
import { AddServiceDialog } from './AddServiceDialog';
import { ConvertLeadDialog } from './ConvertLeadDialog';
import { LeadActivityTimeline } from './LeadActivityTimeline';
import { LeadNotesPanel } from './LeadNotesPanel';
import { LeadCockpitPanel } from './LeadCockpitPanel';
import { DocumentsTab } from '@/components/shared/DocumentsTab';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

function expiryBadge(expiry: string) {
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) return <Badge variant="destructive">Expired</Badge>;
  if (days <= 7) return <Badge variant="destructive">{days}d left</Badge>;
  if (days <= 30) return <Badge className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30" variant="outline">{days}d left</Badge>;
  return <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" variant="outline">{days}d left</Badge>;
}

function validityProgress(start: string | null, expiry: string): number {
  if (!start) return 50;
  const startMs = new Date(start).getTime();
  const expiryMs = new Date(expiry).getTime();
  const total = expiryMs - startMs;
  if (total <= 0) return 100;
  const elapsed = Date.now() - startMs;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

const SCORE_COLORS = {
  hot: 'bg-destructive/10 text-destructive',
  warm: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
  cold: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
};

interface Props { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; }

export function LeadDetailSheet({ open, onOpenChange, lead }: Props) {
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [notesPrefill, setNotesPrefill] = useState<string | null>(null);
  const { data: services, isLoading } = useLeadServices(lead?.id ?? null);
  const deleteService = useDeleteService();
  const updateService = useUpdateService();
  const unconvert = useUnconvertLead();

  if (!lead) return null;

  const stageConfig = LEAD_STAGES.find(s => s.value === lead.stage);
  const band = (lead.score_band || 'cold') as 'hot' | 'warm' | 'cold';
  const isConverted = !!lead.converted_at;

  const atRisk = (services || []).filter(s => {
    const d = differenceInDays(new Date(s.expiry_date), new Date());
    return d >= 0 && d <= 30;
  }).length;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Target },
    { key: 'activity', label: 'Activity', icon: Clock },
    { key: 'notes', label: 'Notes', icon: StickyNote },
    { key: 'tasks', label: 'Tasks', icon: ListTodo },
    { key: 'files', label: 'Files', icon: FileText },
    { key: 'quotes', label: 'Quotes', icon: Receipt },
  ];

  const openNotesWithType = (noteType: string) => {
    setActiveTab('notes');
    setNotesPrefill(noteType);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-5xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center gap-3 flex-wrap">
              <SheetTitle className="text-xl">{lead.company_name}</SheetTitle>
              <Badge variant="outline" className={stageConfig?.color || ''}>{stageConfig?.label || lead.stage}</Badge>
              <Badge variant="outline" className={`capitalize ${SCORE_COLORS[band]}`}>{band}</Badge>
              {isConverted && <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30" variant="outline">Converted</Badge>}
            </div>
          </SheetHeader>

          {/* Quick Action Bar */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => openNotesWithType('call_log')} className="h-8 text-xs gap-1.5">
              <PhoneCall className="h-3.5 w-3.5" /> Log Call
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNotesWithType('meeting_log')} className="h-8 text-xs gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" /> Log Meeting
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNotesWithType('email_log')} className="h-8 text-xs gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Log Email
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNotesWithType('general')} className="h-8 text-xs gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Add Note
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNotesWithType('follow_up')} className="h-8 text-xs gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Follow-up
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddServiceOpen(true)} className="h-8 text-xs gap-1.5">
              <Package className="h-3.5 w-3.5" /> Add Service
            </Button>
            {!isConverted && lead.stage === 'won' && (
              <Button size="sm" onClick={() => setConvertOpen(true)} className="h-8 text-xs gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Convert
              </Button>
            )}
          </div>

          {/* 2-column layout */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            {/* Main column */}
            <div className="min-w-0">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start flex-wrap h-auto">
                  {tabs.map(t => (
                    <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                      <t.icon className="h-3.5 w-3.5" />
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-4 space-y-5">
                  {isConverted && (
                    <Card className="border border-muted">
                      <CardContent className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">Converted on {format(new Date(lead.converted_at!), 'MMM d, yyyy')}</p>
                          <p className="text-xs text-muted-foreground">Account, Contact, and Opportunity were created from this lead.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => unconvert.mutate({ id: lead.id })} disabled={unconvert.isPending} className="gap-1.5 text-destructive hover:text-destructive">
                          <Undo2 className="h-3.5 w-3.5" />{unconvert.isPending ? 'Reversing…' : 'Undo Conversion'}
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border">
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h4>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{lead.contact_name}</span>
                      </div>
                      {lead.contact_email && <div className="flex items-center gap-2 text-sm"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{lead.contact_email}</span></div>}
                      {lead.contact_phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{lead.contact_phone}</span></div>}
                      {lead.website && <div className="flex items-center gap-2 text-sm"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-foreground">{lead.website}</span></div>}
                      {lead.industry && <Badge variant="secondary" className="text-[10px]">{lead.industry}</Badge>}
                    </CardContent>
                  </Card>

                  {/* Pipeline */}
                  <Card className="border">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {LEAD_STAGES.map((s, i) => (
                          <div key={s.value} className="flex items-center">
                            <div className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${
                              s.value === lead.stage ? s.color + ' ring-1 ring-offset-1' :
                              LEAD_STAGES.findIndex(st => st.value === lead.stage) > i ? 'bg-muted text-foreground' : 'bg-muted/50 text-muted-foreground'
                            }`}>
                              {s.label}
                            </div>
                            {i < LEAD_STAGES.length - 1 && <div className="w-3 h-px bg-border mx-0.5" />}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {lead.notes && (
                    <div className="flex gap-2">
                      <StickyNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-sm text-muted-foreground">{lead.notes}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Services */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-foreground">Services / Solutions</h3>
                      <Badge variant="outline" className="gap-1"><Package className="h-3 w-3" />{services?.length || 0}</Badge>
                      {atRisk > 0 && <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/30"><AlertTriangle className="h-3 w-3" />{atRisk} at risk</Badge>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setAddServiceOpen(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </div>

                  {isLoading ? (
                    <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
                  ) : (!services || services.length === 0) ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">No services added yet.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {services.map((s) => {
                        const days = differenceInDays(new Date(s.expiry_date), new Date());
                        const progress = validityProgress(s.start_date, s.expiry_date);
                        return (
                          <Card key={s.id} className="border">
                            <CardContent className="pt-3 pb-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <span className="font-medium text-foreground text-sm">{s.service_name}</span>
                                <div className="flex items-center gap-1">{expiryBadge(s.expiry_date)}</div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>{s.start_date ? format(new Date(s.start_date), 'MMM d, yyyy') : '—'}</span>
                                  <span>{format(new Date(s.expiry_date), 'MMM d, yyyy')}</span>
                                </div>
                                <Progress value={progress} className="h-1.5" />
                              </div>
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-muted-foreground">{days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}</span>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => updateService.mutate({ id: s.id, lead_id: lead.id, status: 'renewed' })}><RefreshCw className="h-3 w-3 mr-1" />Renew</Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteService.mutate({ id: s.id, lead_id: lead.id })}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="activity" className="mt-4">
                  <LeadActivityTimeline leadId={lead.id} />
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  <LeadNotesPanel
                    leadId={lead.id}
                    prefillNoteType={notesPrefill}
                    onPrefillConsumed={() => setNotesPrefill(null)}
                  />
                </TabsContent>

                <TabsContent value="tasks" className="mt-4">
                  <div className="text-center py-12 text-muted-foreground">
                    <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Tasks Integration</p>
                    <p className="text-xs mt-1">Linked tasks will appear here in a future update.</p>
                  </div>
                </TabsContent>

                <TabsContent value="files" className="mt-4">
                  <DocumentsTab entityType="lead" entityId={lead.id} />
                </TabsContent>

                <TabsContent value="quotes" className="mt-4">
                  <div className="text-center py-12 text-muted-foreground">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Quotes & Proposals</p>
                    <p className="text-xs mt-1">Linked quotes will appear here in a future update.</p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Cockpit column */}
            <div className="hidden lg:block">
              <LeadCockpitPanel lead={lead} services={services || []} />
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <AddServiceDialog open={addServiceOpen} onOpenChange={setAddServiceOpen} leadId={lead.id} />
      <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />
    </>
  );
}

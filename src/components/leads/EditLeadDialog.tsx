import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateLead, useLeadServices, useAddService, useUpdateService, useDeleteService, useCheckDuplicates, LEAD_STAGES, type Lead, type LeadStage } from '@/hooks/useLeads';
import { Plus, X, Loader2, AlertTriangle, Building2, User, TrendingUp } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { LostReasonDialog } from './LostReasonDialog';
import { useChangeStage } from '@/hooks/useLeads';
import { CountryCombobox } from '@/components/shared/CountryCombobox';

const SERVICE_TYPES = ['SSL Certificate', 'Digital Certificate', 'Digital Signature', 'ACME', 'Domain Registration', 'Web Hosting', 'Email Security', 'Code Signing', 'Custom'];

interface SolutionRow {
  id?: string;
  type: string;
  service_name: string;
  start_date: string;
  expiry_date: string;
  _deleted?: boolean;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; }

export function EditLeadDialog({ open, onOpenChange, lead }: Props) {
  const [form, setForm] = useState({
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    status: 'potential', source: '', notes: '',
    stage: 'new' as LeadStage,
    estimated_value: '', currency: 'USD', probability_percent: '0',
    expected_close_date: '', next_follow_up_at: '',
    industry: '', website: '', secondary_phone: '', city: '', country: '',
    country_code: '' as string, country_name: '' as string, state_province: '',
  });
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [duplicates, setDuplicates] = useState<Record<string, unknown>[]>([]);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<LeadStage | null>(null);

  const update = useUpdateLead();
  const addService = useAddService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const changeStage = useChangeStage();
  const checkDuplicates = useCheckDuplicates();
  const { data: existingServices, isLoading: servicesLoading } = useLeadServices(lead?.id ?? null);

  useEffect(() => {
    if (lead) setForm({
      company_name: lead.company_name,
      contact_name: lead.contact_name,
      contact_email: lead.contact_email || '',
      contact_phone: lead.contact_phone || '',
      status: lead.status,
      source: lead.source || '',
      notes: lead.notes || '',
      stage: lead.stage || 'new',
      estimated_value: lead.estimated_value?.toString() || '',
      currency: lead.currency || 'USD',
      probability_percent: lead.probability_percent?.toString() || '0',
      expected_close_date: lead.expected_close_date || '',
      next_follow_up_at: lead.next_follow_up_at ? lead.next_follow_up_at.slice(0, 16) : '',
      industry: lead.industry || '',
      website: lead.website || '',
      secondary_phone: lead.secondary_phone || '',
      city: lead.city || '',
      country: lead.country || '',
      country_code: lead.country_code || '',
      country_name: lead.country_name || '',
      state_province: lead.state_province || '',
    });
  }, [lead]);

  useEffect(() => {
    if (existingServices) {
      setSolutions(existingServices.filter(s => !s.deleted_at).map(s => {
        const isKnown = SERVICE_TYPES.includes(s.service_name);
        return { id: s.id, type: isKnown ? s.service_name : 'Custom', service_name: s.service_name, start_date: s.start_date || '', expiry_date: s.expiry_date };
      }));
    }
  }, [existingServices]);

  const handleDuplicateCheck = useCallback(async () => {
    if (!lead || (!form.company_name && !form.contact_email && !form.contact_phone)) return;
    try {
      const result = await checkDuplicates.mutateAsync({
        company_name: form.company_name || undefined,
        email: form.contact_email || undefined,
        phone: form.contact_phone || undefined,
        exclude_id: lead.id,
      });
      setDuplicates(result?.duplicates || []);
    } catch { /* ignore */ }
  }, [form.company_name, form.contact_email, form.contact_phone, lead?.id]);

  const handleStageChange = (newStage: LeadStage) => {
    if (newStage === 'lost') {
      setPendingStage(newStage);
      setLostDialogOpen(true);
    } else {
      setForm(f => ({ ...f, stage: newStage }));
    }
  };

  const handleTypeChange = (idx: number, val: string) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, type: val, service_name: val !== 'Custom' ? val : '' } : s));
  };

  const updateSolutionField = (idx: number, field: keyof SolutionRow, val: string) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };

  const removeSolution = (idx: number) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, _deleted: true } : s));
  };

  const handleSubmit = async () => {
    if (!lead || !form.company_name.trim() || !form.contact_name.trim()) return;
    setSubmitting(true);
    try {
      await new Promise<void>((resolve, reject) => {
        update.mutate({
          id: lead.id,
          company_name: form.company_name,
          contact_name: form.contact_name,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          status: form.status,
          source: form.source || null,
          notes: form.notes || null,
          stage: form.stage,
          estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
          currency: form.currency,
          probability_percent: Number(form.probability_percent) || 0,
          expected_close_date: form.expected_close_date || null,
          next_follow_up_at: form.next_follow_up_at || null,
          industry: form.industry || null,
          website: form.website || null,
          secondary_phone: form.secondary_phone || null,
          city: form.city || null,
          country: form.country_name || form.country || null,
          country_code: form.country_code || null,
          country_name: form.country_name || null,
          state_province: form.state_province || null,
        } as any, { onSuccess: () => resolve(), onError: (e) => reject(e) });
      });

      const promises: Promise<void>[] = [];
      for (const sol of solutions) {
        if (sol._deleted && sol.id) {
          promises.push(new Promise<void>((resolve, reject) => {
            deleteService.mutate({ id: sol.id!, lead_id: lead.id }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
          }));
        } else if (!sol._deleted && !sol.id && sol.service_name.trim() && sol.expiry_date) {
          promises.push(new Promise<void>((resolve, reject) => {
            addService.mutate({ lead_id: lead.id, service_name: sol.service_name, start_date: sol.start_date || undefined, expiry_date: sol.expiry_date }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
          }));
        } else if (!sol._deleted && sol.id && sol.service_name.trim() && sol.expiry_date) {
          const orig = existingServices?.find(s => s.id === sol.id);
          if (orig && (orig.service_name !== sol.service_name || orig.start_date !== (sol.start_date || null) || orig.expiry_date !== sol.expiry_date)) {
            promises.push(new Promise<void>((resolve, reject) => {
              updateService.mutate({ id: sol.id!, lead_id: lead.id, service_name: sol.service_name, start_date: sol.start_date || undefined, expiry_date: sol.expiry_date }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
            }));
          }
        }
      }
      await Promise.all(promises);
      onOpenChange(false);
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const visibleSolutions = solutions.filter(s => !s._deleted);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
            <div className="space-y-5">
              {duplicates.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/5">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--warning))]">Possible duplicates found</p>
                    {duplicates.map((d: any) => (
                      <p key={d.id} className="text-xs text-muted-foreground">
                        {d.company_name} — {d.contact_email || d.contact_phone || 'No contact'}
                        <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">{d.stage}</Badge>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Company Info */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Company Information</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} onBlur={handleDuplicateCheck} /></div>
                  <div><Label className="text-xs">Industry</Label><Input value={form.industry} onChange={(e) => setForm(f => ({ ...f, industry: e.target.value }))} /></div>
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Website</Label>
                  <Input value={form.website} onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} />
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <Label className="text-xs">Country</Label>
                    <CountryCombobox
                      value={form.country_code || null}
                      onChange={(code, name) => setForm(f => ({ ...f, country_code: code || '', country_name: name || '', country: name || f.country }))}
                    />
                  </div>
                  <div><Label className="text-xs">State / Province</Label><Input value={form.state_province} onChange={(e) => setForm(f => ({ ...f, state_province: e.target.value }))} /></div>
                  <div><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div><Label className="text-xs">Source</Label><Input value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))} /></div>
                  <div><Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="potential">Potential</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Contact Details</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Contact Name *</Label><Input value={form.contact_name} onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
                  <div><Label className="text-xs">Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} onBlur={handleDuplicateCheck} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div><Label className="text-xs">Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))} onBlur={handleDuplicateCheck} /></div>
                  <div><Label className="text-xs">Secondary Phone</Label><Input value={form.secondary_phone} onChange={(e) => setForm(f => ({ ...f, secondary_phone: e.target.value }))} /></div>
                </div>
              </div>

              <Separator />

              {/* Deal Intelligence */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Deal Intelligence</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">Pipeline Stage</Label>
                    <Select value={form.stage} onValueChange={(v) => handleStageChange(v as LeadStage)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEAD_STAGES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Estimated Value</Label><Input type="number" value={form.estimated_value} onChange={(e) => setForm(f => ({ ...f, estimated_value: e.target.value }))} /></div>
                  <div><Label className="text-xs">Probability %</Label><Input type="number" min="0" max="100" value={form.probability_percent} onChange={(e) => setForm(f => ({ ...f, probability_percent: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div><Label className="text-xs">Expected Close Date</Label><Input type="date" value={form.expected_close_date} onChange={(e) => setForm(f => ({ ...f, expected_close_date: e.target.value }))} /></div>
                  <div><Label className="text-xs">Next Follow-up</Label><Input type="datetime-local" value={form.next_follow_up_at} onChange={(e) => setForm(f => ({ ...f, next_follow_up_at: e.target.value }))} /></div>
                </div>
              </div>

              <Separator />

              <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>

              <Separator />

              {/* Solutions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-base font-semibold">Solutions / Services</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSolutions(prev => [...prev, { type: '', service_name: '', start_date: '', expiry_date: '' }])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Solution
                  </Button>
                </div>
                {servicesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading services...</div>
                ) : visibleSolutions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No solutions added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {solutions.map((sol, idx) => {
                      if (sol._deleted) return null;
                      return (
                        <div key={sol.id || idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <Label className="text-xs">Service Type *</Label>
                              <Select value={sol.type} onValueChange={(v) => handleTypeChange(idx, v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                  {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            {sol.type === 'Custom' && (
                              <div className="flex-1">
                                <Label className="text-xs">Custom Name *</Label>
                                <Input className="h-8 text-xs" value={sol.service_name} onChange={(e) => updateSolutionField(idx, 'service_name', e.target.value)} />
                              </div>
                            )}
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 mt-5 text-destructive" onClick={() => removeSolution(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-xs">Start Date</Label><Input className="h-8 text-xs" type="date" value={sol.start_date} onChange={(e) => updateSolutionField(idx, 'start_date', e.target.value)} /></div>
                            <div><Label className="text-xs">Expiry Date *</Label><Input className="h-8 text-xs" type="date" value={sol.expiry_date} onChange={(e) => updateSolutionField(idx, 'expiry_date', e.target.value)} /></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lead && (
        <LostReasonDialog
          open={lostDialogOpen}
          onOpenChange={setLostDialogOpen}
          isPending={changeStage.isPending}
          onConfirm={(reason, notes) => {
            changeStage.mutate({ id: lead.id, stage: 'lost', lost_reason_code: reason, lost_notes: notes }, {
              onSuccess: () => {
                setLostDialogOpen(false);
                onOpenChange(false);
              },
            });
          }}
        />
      )}
    </>
  );
}

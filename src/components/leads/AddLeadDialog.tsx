import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateLead, useAddService, useCheckDuplicates, LEAD_STAGES, type LeadStage, type Lead } from '@/hooks/useLeads';
import { Plus, X, AlertTriangle, Building2, User, TrendingUp } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CountryCombobox } from '@/components/shared/CountryCombobox';
import { getCountryName } from '@/lib/countries';

const SERVICE_TYPES = ['SSL Certificate', 'Digital Certificate', 'Digital Signature', 'ACME', 'Domain Registration', 'Web Hosting', 'Email Security', 'Code Signing', 'Custom'];

interface SolutionRow {
  type: string;
  service_name: string;
  start_date: string;
  expiry_date: string;
}

const emptySolution = (): SolutionRow => ({ type: '', service_name: '', start_date: '', expiry_date: '' });

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function AddLeadDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    status: 'potential', source: '', notes: '',
    stage: 'new' as LeadStage,
    estimated_value: '', currency: 'USD', probability_percent: '0',
    expected_close_date: '', next_follow_up_at: '',
    industry: '', website: '', secondary_phone: '', city: '', country: '',
    country_code: '' as string, state_province: '',
  });
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [duplicates, setDuplicates] = useState<Record<string, unknown>[]>([]);
  const create = useCreateLead();
  const addService = useAddService();
  const checkDuplicates = useCheckDuplicates();
  const [submitting, setSubmitting] = useState(false);

  const handleDuplicateCheck = useCallback(async () => {
    if (!form.company_name && !form.contact_email && !form.contact_phone) return;
    try {
      const result = await checkDuplicates.mutateAsync({
        company_name: form.company_name || undefined,
        email: form.contact_email || undefined,
        phone: form.contact_phone || undefined,
      });
      setDuplicates(result?.duplicates || []);
    } catch { /* ignore */ }
  }, [form.company_name, form.contact_email, form.contact_phone]);

  const handleTypeChange = (idx: number, val: string) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, type: val, service_name: val !== 'Custom' ? val : '' } : s));
  };

  const updateSolution = (idx: number, field: keyof SolutionRow, val: string) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };

  const removeSolution = (idx: number) => setSolutions(prev => prev.filter((_, i) => i !== idx));
  const validSolutions = solutions.filter(s => s.service_name.trim() && s.expiry_date);

  const resetForm = () => {
    setForm({ company_name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'potential', source: '', notes: '', stage: 'new', estimated_value: '', currency: 'USD', probability_percent: '0', expected_close_date: '', next_follow_up_at: '', industry: '', website: '', secondary_phone: '', city: '', country: '', country_code: '', state_province: '' });
    setSolutions([]);
    setDuplicates([]);
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim() || !form.contact_name.trim()) return;
    setSubmitting(true);
    try {
      const result = await new Promise<any>((resolve, reject) => {
        create.mutate({
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
          country: form.country_code ? getCountryName(form.country_code) : (form.country || null),
          country_code: form.country_code || null,
          country_name: form.country_code ? getCountryName(form.country_code) : null,
          state_province: form.state_province || null,
        } as Partial<Lead>, {
          onSuccess: (data) => resolve(data),
          onError: (err) => reject(err),
        });
      });

      const leadId = result?.lead?.id;
      if (leadId && validSolutions.length > 0) {
        await Promise.all(validSolutions.map(s =>
          new Promise<void>((resolve, reject) => {
            addService.mutate(
              { lead_id: leadId, service_name: s.service_name, start_date: s.start_date || undefined, expiry_date: s.expiry_date },
              { onSuccess: () => resolve(), onError: (e) => reject(e) }
            );
          })
        ));
      }

      onOpenChange(false);
      resetForm();
    } catch {
      // errors handled by mutation toasts
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader><DialogTitle>Add New Lead</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-5">
            {/* Duplicate Warning */}
            {duplicates.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/5">
                <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--warning))]">Possible duplicates found</p>
                  <div className="mt-1 space-y-1">
                    {duplicates.map((d: any) => (
                      <p key={d.id} className="text-xs text-muted-foreground">
                        {d.company_name} — {d.contact_email || d.contact_phone || 'No contact'}
                        <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">{d.stage}</Badge>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Section: Company Info */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Company Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} onBlur={handleDuplicateCheck} /></div>
                <div><Label className="text-xs">Industry</Label><Input value={form.industry} onChange={(e) => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="e.g. Technology, Finance" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div><Label className="text-xs">Website</Label><Input value={form.website} onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." /></div>
                <div><Label className="text-xs">Country *</Label>
                  <CountryCombobox value={form.country_code || null} onChange={(code) => setForm(f => ({ ...f, country_code: code || '' }))} required />
                </div>
                <div><Label className="text-xs">State / Province</Label><Input value={form.state_province} onChange={(e) => setForm(f => ({ ...f, state_province: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div><Label className="text-xs">Source</Label><Input value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. Referral, Website" /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-2">
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

            {/* Section: Contact Details */}
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

            {/* Section: Deal Intelligence */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Deal Intelligence</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">Pipeline Stage</Label>
                  <Select value={form.stage} onValueChange={(v) => setForm(f => ({ ...f, stage: v as LeadStage }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_STAGES.filter(s => s.value !== 'lost').map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Estimated Value</Label><Input type="number" value={form.estimated_value} onChange={(e) => setForm(f => ({ ...f, estimated_value: e.target.value }))} placeholder="0.00" /></div>
                <div><Label className="text-xs">Probability %</Label><Input type="number" min="0" max="100" value={form.probability_percent} onChange={(e) => setForm(f => ({ ...f, probability_percent: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div><Label className="text-xs">Expected Close Date</Label><Input type="date" value={form.expected_close_date} onChange={(e) => setForm(f => ({ ...f, expected_close_date: e.target.value }))} /></div>
                <div><Label className="text-xs">Next Follow-up</Label><Input type="datetime-local" value={form.next_follow_up_at} onChange={(e) => setForm(f => ({ ...f, next_follow_up_at: e.target.value }))} /></div>
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>

            <Separator />

            {/* Solutions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Solutions / Services</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setSolutions(prev => [...prev, emptySolution()])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Solution
                </Button>
              </div>
              {solutions.length === 0 && (
                <p className="text-sm text-muted-foreground">No solutions added yet. You can add them now or later.</p>
              )}
              <div className="space-y-3">
                {solutions.map((sol, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/20">
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
                          <Input className="h-8 text-xs" value={sol.service_name} onChange={(e) => updateSolution(idx, 'service_name', e.target.value)} placeholder="Service name" />
                        </div>
                      )}
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 mt-5 text-destructive" onClick={() => removeSolution(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Start Date</Label><Input className="h-8 text-xs" type="date" value={sol.start_date} onChange={(e) => updateSolution(idx, 'start_date', e.target.value)} /></div>
                      <div><Label className="text-xs">Expiry Date *</Label><Input className="h-8 text-xs" type="date" value={sol.expiry_date} onChange={(e) => updateSolution(idx, 'expiry_date', e.target.value)} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || !form.company_name.trim() || !form.contact_name.trim()}>
            {submitting ? 'Creating...' : 'Create Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

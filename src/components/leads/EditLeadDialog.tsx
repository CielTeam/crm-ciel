import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateLead, useLeadServices, useAddService, useUpdateService, useDeleteService, type Lead } from '@/hooks/useLeads';
import { Plus, X, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const SERVICE_TYPES = ['SSL Certificate', 'Digital Certificate', 'Digital Signature', 'ACME', 'Domain Registration', 'Web Hosting', 'Email Security', 'Code Signing', 'Custom'];

interface SolutionRow {
  id?: string; // existing service id
  type: string;
  service_name: string;
  start_date: string;
  expiry_date: string;
  _deleted?: boolean;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; }

export function EditLeadDialog({ open, onOpenChange, lead }: Props) {
  const [form, setForm] = useState({ company_name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'potential', source: '', notes: '' });
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const update = useUpdateLead();
  const addService = useAddService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const { data: existingServices, isLoading: servicesLoading } = useLeadServices(lead?.id ?? null);

  useEffect(() => {
    if (lead) setForm({ company_name: lead.company_name, contact_name: lead.contact_name, contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '', status: lead.status, source: lead.source || '', notes: lead.notes || '' });
  }, [lead]);

  useEffect(() => {
    if (existingServices) {
      setSolutions(existingServices.filter(s => !s.deleted_at).map(s => {
        const isKnown = SERVICE_TYPES.includes(s.service_name);
        return {
          id: s.id,
          type: isKnown ? s.service_name : 'Custom',
          service_name: s.service_name,
          start_date: s.start_date || '',
          expiry_date: s.expiry_date,
        };
      }));
    }
  }, [existingServices]);

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
      // Update lead info
      await new Promise<void>((resolve, reject) => {
        update.mutate({ id: lead.id, ...form }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
      });

      // Handle solutions
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
          // Check if changed
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
      // errors handled by mutation toasts
    } finally {
      setSubmitting(false);
    }
  };

  const visibleSolutions = solutions.filter(s => !s._deleted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
              <div><Label>Contact Name *</Label><Input value={form.contact_name} onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="potential">Potential</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Source</Label><Input value={form.source} onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>

            <Separator />

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
                              <Input className="h-8 text-xs" value={sol.service_name} onChange={(e) => updateSolutionField(idx, 'service_name', e.target.value)} placeholder="Service name" />
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
  );
}

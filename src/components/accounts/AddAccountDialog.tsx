import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CountryCombobox } from '@/components/shared/CountryCombobox';
import { useCreateAccount, useAddAccountService } from '@/hooks/useAccountsContacts';
import { Plus, X } from 'lucide-react';

const SERVICE_TYPES = ['SSL Certificate', 'Digital Certificate', 'Digital Signature', 'ACME', 'Domain Registration', 'Web Hosting', 'Email Security', 'Code Signing', 'Custom'];

interface SolutionRow {
  type: string;
  service_name: string;
  start_date: string;
  expiry_date: string;
}

const emptySolution = (): SolutionRow => ({ type: '', service_name: '', start_date: '', expiry_date: '' });

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function AddAccountDialog({ open, onOpenChange }: Props) {
  const create = useCreateAccount();
  const addService = useAddAccountService();
  const [form, setForm] = useState({
    name: '', industry: '', email: '', phone: '', website: '',
    country_code: null as string | null, country_name: null as string | null,
    state_province: '', city: '', notes: '',
  });
  const [solutions, setSolutions] = useState<SolutionRow[]>([]);

  const reset = () => {
    setForm({ name: '', industry: '', email: '', phone: '', website: '', country_code: null, country_name: null, state_province: '', city: '', notes: '' });
    setSolutions([]);
  };

  const handleTypeChange = (idx: number, val: string) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, type: val, service_name: val !== 'Custom' ? val : '' } : s));
  };
  const updateSolution = (idx: number, field: keyof SolutionRow, val: string) => {
    setSolutions(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };
  const removeSolution = (idx: number) => setSolutions(prev => prev.filter((_, i) => i !== idx));
  const validSolutions = solutions.filter(s => s.service_name.trim() && s.expiry_date);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      const account = await create.mutateAsync({
        name: form.name,
        industry: form.industry || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        country_code: form.country_code,
        country_name: form.country_name,
        country: form.country_name, // keep legacy column populated
        state_province: form.state_province || null,
        city: form.city || null,
        notes: form.notes || null,
      });

      if (account?.id && validSolutions.length > 0) {
        await Promise.all(validSolutions.map(s =>
          addService.mutateAsync({
            account_id: account.id,
            service_name: s.service_name,
            start_date: s.start_date || null,
            expiry_date: s.expiry_date,
          }).catch(() => null)
        ));
      }

      reset();
      onOpenChange(false);
    } catch { /* toast handled by hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl max-h-[90vh] w-[calc(100vw-2rem)] sm:w-full p-4 sm:p-6">
        <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Company Name *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Industry</Label><Input value={form.industry} onChange={(e) => setForm(f => ({ ...f, industry: e.target.value }))} /></div>
              <div><Label className="text-xs">Website</Label><Input value={form.website} onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <CountryCombobox
                value={form.country_code}
                onChange={(code, name) => setForm(f => ({ ...f, country_code: code, country_name: name }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">State / Province</Label><Input value={form.state_province} onChange={(e) => setForm(f => ({ ...f, state_province: e.target.value }))} /></div>
              <div><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>

            <Separator />

            {/* Solutions / Services */}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !form.name.trim()}>
            {create.isPending ? 'Creating…' : 'Create Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

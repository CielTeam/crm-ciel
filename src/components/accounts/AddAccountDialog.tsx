import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CountryCombobox } from '@/components/shared/CountryCombobox';
import { useCreateAccount } from '@/hooks/useAccountsContacts';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function AddAccountDialog({ open, onOpenChange }: Props) {
  const create = useCreateAccount();
  const [form, setForm] = useState({
    name: '', industry: '', email: '', phone: '', website: '',
    country_code: null as string | null, country_name: null as string | null,
    state_province: '', city: '', notes: '',
  });

  const reset = () => setForm({ name: '', industry: '', email: '', phone: '', website: '', country_code: null, country_name: null, state_province: '', city: '', notes: '' });

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    try {
      await create.mutateAsync({
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
      reset();
      onOpenChange(false);
    } catch { /* toast handled by hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Company Name *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Industry</Label><Input value={form.industry} onChange={(e) => setForm(f => ({ ...f, industry: e.target.value }))} /></div>
              <div><Label className="text-xs">Website</Label><Input value={form.website} onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">State / Province</Label><Input value={form.state_province} onChange={(e) => setForm(f => ({ ...f, state_province: e.target.value }))} /></div>
              <div><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
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

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCreateContact } from '@/hooks/useAccountsContacts';
import type { Account } from '@/hooks/useAccountsContacts';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: Account[];
  defaultAccountId?: string | null;
}

export function AddContactDialog({ open, onOpenChange, accounts, defaultAccountId }: Props) {
  const create = useCreateContact();
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', secondary_phone: '',
    job_title: '', notes: '', account_id: defaultAccountId || '',
  });

  const reset = () => setForm({ first_name: '', last_name: '', email: '', phone: '', secondary_phone: '', job_title: '', notes: '', account_id: defaultAccountId || '' });

  const handleSubmit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    try {
      await create.mutateAsync({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        secondary_phone: form.secondary_phone || null,
        job_title: form.job_title || null,
        notes: form.notes || null,
        account_id: form.account_id || null,
      });
      reset();
      onOpenChange(false);
    } catch { /* toast handled by hook */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">First Name *</Label><Input value={form.first_name} onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))} /></div>
              <div><Label className="text-xs">Last Name *</Label><Input value={form.last_name} onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="text-xs">Job Title</Label>
              <Input value={form.job_title} onChange={(e) => setForm(f => ({ ...f, job_title: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Account</Label>
              <Select value={form.account_id || 'none'} onValueChange={(v) => setForm(f => ({ ...f, account_id: v === 'none' ? '' : v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No account —</SelectItem>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div>
              <Label className="text-xs">Secondary Phone</Label>
              <Input value={form.secondary_phone} onChange={(e) => setForm(f => ({ ...f, secondary_phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !form.first_name.trim() || !form.last_name.trim()}>
            {create.isPending ? 'Creating…' : 'Create Contact'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

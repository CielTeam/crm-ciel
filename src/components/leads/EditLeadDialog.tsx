import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateLead, type Lead } from '@/hooks/useLeads';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; lead: Lead | null; }

export function EditLeadDialog({ open, onOpenChange, lead }: Props) {
  const [form, setForm] = useState({ company_name: '', contact_name: '', contact_email: '', contact_phone: '', status: 'potential', source: '', notes: '' });
  const update = useUpdateLead();

  useEffect(() => {
    if (lead) setForm({ company_name: lead.company_name, contact_name: lead.contact_name, contact_email: lead.contact_email || '', contact_phone: lead.contact_phone || '', status: lead.status, source: lead.source || '', notes: lead.notes || '' });
  }, [lead]);

  const handleSubmit = () => {
    if (!lead || !form.company_name.trim() || !form.contact_name.trim()) return;
    update.mutate({ id: lead.id, ...form }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
          <div><Label>Contact Name *</Label><Input value={form.contact_name} onChange={(e) => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.contact_phone} onChange={(e) => setForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
          </div>
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
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
        </div>
        <DialogFooter><Button onClick={handleSubmit} disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save Changes'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

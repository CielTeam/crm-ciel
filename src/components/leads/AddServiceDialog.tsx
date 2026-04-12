import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddService } from '@/hooks/useLeads';

const SERVICE_TYPES = ['SSL Certificate', 'Digital Certificate', 'Digital Signature', 'ACME', 'Domain Registration', 'Web Hosting', 'Email Security', 'Code Signing', 'Custom'];

interface Props { open: boolean; onOpenChange: (v: boolean) => void; leadId: string; }

export function AddServiceDialog({ open, onOpenChange, leadId }: Props) {
  const [form, setForm] = useState({ service_name: '', description: '', start_date: '', expiry_date: '' });
  const [selectedType, setSelectedType] = useState('');
  const add = useAddService();

  const handleTypeChange = (val: string) => {
    setSelectedType(val);
    if (val !== 'Custom') {
      setForm(f => ({ ...f, service_name: val }));
    } else {
      setForm(f => ({ ...f, service_name: '' }));
    }
  };

  const handleSubmit = () => {
    if (!form.service_name.trim() || !form.expiry_date) return;
    add.mutate({ lead_id: leadId, ...form }, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ service_name: '', description: '', start_date: '', expiry_date: '' });
        setSelectedType('');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Service / Solution</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Service Type *</Label>
            <Select value={selectedType} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue placeholder="Select a service type" /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedType === 'Custom' && (
            <div>
              <Label>Custom Service Name *</Label>
              <Input value={form.service_name} onChange={(e) => setForm(f => ({ ...f, service_name: e.target.value }))} placeholder="Enter service name" />
            </div>
          )}
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><Label>Expiry Date *</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={handleSubmit} disabled={add.isPending || !form.service_name.trim() || !form.expiry_date}>{add.isPending ? 'Adding...' : 'Add Service'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

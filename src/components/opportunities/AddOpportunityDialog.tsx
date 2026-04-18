import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateOpportunity, OPPORTUNITY_STAGES, type OpportunityStage } from '@/hooks/useOpportunities';
import { useAccounts } from '@/hooks/useAccountsContacts';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAccountId?: string;
}

export function AddOpportunityDialog({ open, onOpenChange, defaultAccountId }: Props) {
  const create = useCreateOpportunity();
  const { data: accounts } = useAccounts();
  const [form, setForm] = useState({
    name: '', account_id: defaultAccountId || '', stage: 'prospecting' as OpportunityStage,
    estimated_value: '', probability_percent: '50', currency: 'USD',
    expected_close_date: '', notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({ ...f, account_id: defaultAccountId || f.account_id }));
    }
  }, [open, defaultAccountId]);

  const handleCreate = () => {
    create.mutate({
      name: form.name,
      account_id: form.account_id || null,
      stage: form.stage,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      probability_percent: Number(form.probability_percent || 0),
      currency: form.currency,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ name: '', account_id: defaultAccountId || '', stage: 'prospecting', estimated_value: '', probability_percent: '50', currency: 'USD', expected_close_date: '', notes: '' });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] w-[calc(100vw-2rem)] sm:w-full overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>New Opportunity</DialogTitle>
          <DialogDescription>Track a sales opportunity through your pipeline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Account</Label>
            <Select value={form.account_id || 'none'} onValueChange={v => setForm(f => ({ ...f, account_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v as OpportunityStage }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPPORTUNITY_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Probability %</Label>
              <Input type="number" min={0} max={100} value={form.probability_percent} onChange={e => setForm(f => ({ ...f, probability_percent: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Value</Label>
              <Input type="number" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: e.target.value }))} />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase().slice(0, 3) }))} />
            </div>
          </div>
          <div>
            <Label>Expected close date</Label>
            <Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={create.isPending || !form.name.trim()}>
            {create.isPending ? 'Creating…' : 'Create Opportunity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

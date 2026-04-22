import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAccountServices } from '@/hooks/useAccountsContacts';
import { useRequestQuotationFromAccount, QUOTATION_CURRENCIES } from '@/hooks/useQuotations';

interface Props {
  accountId: string;
  preselectedServiceIds: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RequestQuotationDialog({ accountId, preselectedServiceIds, open, onOpenChange }: Props) {
  const { data: services } = useAccountServices(accountId);
  const request = useRequestQuotationFromAccount();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<string>('USD');
  const [notes, setNotes] = useState('');
  const [totalOverride, setTotalOverride] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(new Set(preselectedServiceIds));
      setNotes('');
      setTotalOverride('');
      setCurrency('USD');
    }
  }, [open, preselectedServiceIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const canSubmit = selected.size > 0 && !request.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const t = totalOverride.trim() ? Number(totalOverride) : null;
    try {
      await request.mutateAsync({
        account_id: accountId,
        account_service_ids: Array.from(selected),
        currency,
        notes: notes.trim() || null,
        total_amount: t != null && !Number.isNaN(t) ? t : null,
      });
      onOpenChange(false);
    } catch { /* toast handled */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send to accounting</DialogTitle>
          <DialogDescription>
            Request a quotation for the selected solutions. Accounting will receive a notification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Solutions to include</Label>
            <div className="mt-2 border rounded-md max-h-48 overflow-y-auto divide-y">
              {(services || []).length === 0 && (
                <div className="p-3 text-sm text-muted-foreground text-center">No solutions on this account.</div>
              )}
              {(services || []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                  <span className="text-sm flex-1">{s.service_name}</span>
                  <span className="text-xs text-muted-foreground">exp {s.expiry_date}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUOTATION_CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Total override (optional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Auto"
                value={totalOverride}
                onChange={(e) => setTotalOverride(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Note for accounting</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional message…"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {request.isPending ? 'Sending…' : 'Send to accounting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

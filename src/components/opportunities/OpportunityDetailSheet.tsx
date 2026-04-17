import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Briefcase, Pencil, Save, X, Trash2, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { useUpdateOpportunity, useDeleteOpportunity, OPPORTUNITY_STAGES, type Opportunity, type OpportunityStage } from '@/hooks/useOpportunities';
import { useAccounts } from '@/hooks/useAccountsContacts';

interface Props {
  opportunity: Opportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OpportunityDetailSheet({ opportunity, open, onOpenChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: '', stage: 'prospecting' as OpportunityStage, estimated_value: '',
    probability_percent: '0', expected_close_date: '', notes: '', account_id: '',
  });
  const update = useUpdateOpportunity();
  const del = useDeleteOpportunity();
  const { data: accounts } = useAccounts();

  useEffect(() => {
    if (opportunity) {
      setForm({
        name: opportunity.name,
        stage: opportunity.stage,
        estimated_value: opportunity.estimated_value?.toString() || '',
        probability_percent: opportunity.probability_percent.toString(),
        expected_close_date: opportunity.expected_close_date || '',
        notes: opportunity.notes || '',
        account_id: opportunity.account_id || '',
      });
      setEditing(false);
    }
  }, [opportunity]);

  if (!opportunity) return null;

  const handleSave = () => {
    update.mutate({
      id: opportunity.id,
      name: form.name,
      stage: form.stage,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      probability_percent: Number(form.probability_percent || 0),
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
      account_id: form.account_id || null,
    }, { onSuccess: () => setEditing(false) });
  };

  const handleDelete = () => {
    del.mutate(opportunity.id, { onSuccess: () => onOpenChange(false) });
  };

  const accountName = (accounts || []).find(a => a.id === opportunity.account_id)?.name;
  const stageInfo = OPPORTUNITY_STAGES.find(s => s.value === opportunity.stage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                <span className="truncate">{editing ? 'Edit Opportunity' : opportunity.name}</span>
              </SheetTitle>
              {!editing && stageInfo && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge variant="outline" className={stageInfo.color}>{stageInfo.label}</Badge>
                  {accountName && <Badge variant="secondary" className="text-xs">{accountName}</Badge>}
                </div>
              )}
            </div>
            {!editing ? (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete opportunity?</AlertDialogTitle>
                      <AlertDialogDescription>This will archive "{opportunity.name}".</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)} disabled={update.isPending}><X className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={handleSave} disabled={update.isPending}><Save className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          {editing ? (
            <>
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
              <div className="grid grid-cols-2 gap-3">
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
              <div>
                <Label>Value</Label>
                <Input type="number" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: e.target.value }))} />
              </div>
              <div>
                <Label>Expected close date</Label>
                <Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><DollarSign className="h-3 w-3" />Value</div>
                  <p className="text-lg font-semibold mt-1">
                    {opportunity.estimated_value ? `${opportunity.currency} ${Number(opportunity.estimated_value).toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3 w-3" />Weighted</div>
                  <p className="text-lg font-semibold mt-1">
                    {opportunity.weighted_forecast ? `${opportunity.currency} ${Number(opportunity.weighted_forecast).toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">Probability</div>
                  <p className="text-lg font-semibold mt-1">{opportunity.probability_percent}%</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2 text-sm">
                {opportunity.expected_close_date && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Expected close: <span className="text-foreground">{opportunity.expected_close_date}</span>
                  </div>
                )}
                {opportunity.won_at && (
                  <div className="text-[hsl(var(--success))]">Won on {new Date(opportunity.won_at).toLocaleDateString()}</div>
                )}
              </div>
              {opportunity.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{opportunity.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

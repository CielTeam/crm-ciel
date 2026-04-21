import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Calendar, Wrench } from 'lucide-react';
import { format, isPast, differenceInDays } from 'date-fns';
import {
  useAccountServices,
  useAddAccountService,
  useDeleteAccountService,
  type AccountService,
} from '@/hooks/useAccountsContacts';

const SERVICE_TYPES = ['SSL Certificate', 'Digital Certificate', 'Digital Signature', 'ACME', 'Domain Registration', 'Web Hosting', 'Email Security', 'Code Signing', 'Custom'];

interface Props { accountId: string }

function statusBadge(svc: AccountService): { label: string; tone: string } {
  if (svc.status === 'cancelled') return { label: 'Cancelled', tone: 'bg-muted text-muted-foreground' };
  if (svc.status === 'renewed') return { label: 'Renewed', tone: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' };
  const expiry = new Date(svc.expiry_date);
  if (isPast(expiry)) return { label: 'Expired', tone: 'bg-destructive/10 text-destructive border-destructive/30' };
  const days = differenceInDays(expiry, new Date());
  if (days <= 30) return { label: `Expires in ${days}d`, tone: 'bg-amber-500/10 text-amber-700 border-amber-500/30' };
  return { label: 'Active', tone: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' };
}

export function AccountSolutionsPanel({ accountId }: Props) {
  const { data: services, isLoading } = useAccountServices(accountId);
  const addService = useAddAccountService();
  const deleteService = useDeleteAccountService();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState('');
  const [customName, setCustomName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const reset = () => {
    setType('');
    setCustomName('');
    setStartDate('');
    setExpiryDate('');
    setAdding(false);
  };

  const serviceName = type === 'Custom' ? customName.trim() : type;
  const canSubmit = !!serviceName && !!expiryDate;

  const handleAdd = async () => {
    if (!canSubmit) return;
    try {
      await addService.mutateAsync({
        account_id: accountId,
        service_name: serviceName,
        start_date: startDate || null,
        expiry_date: expiryDate,
      });
      reset();
    } catch { /* toast handled */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Solutions</h3>
          <Badge variant="outline">{services?.length || 0}</Badge>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Solution
          </Button>
        )}
      </div>

      {adding && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Label className="text-xs">Service Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {type === 'Custom' && (
              <div className="flex-1">
                <Label className="text-xs">Custom Name *</Label>
                <Input className="h-8 text-xs" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Service name" />
              </div>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 mt-5 text-muted-foreground" onClick={reset}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input className="h-8 text-xs" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Expiry Date *</Label>
              <Input className="h-8 text-xs" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={!canSubmit || addService.isPending}>
              {addService.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !services || services.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md">
          <Wrench className="h-7 w-7 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No solutions added yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((s) => {
            const badge = statusBadge(s);
            return (
              <div key={s.id} className="border rounded-lg p-3 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{s.service_name}</p>
                    <Badge variant="outline" className={`text-[10px] ${badge.tone}`}>{badge.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {s.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Start {format(new Date(s.start_date), 'MMM d, yyyy')}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Expires {format(new Date(s.expiry_date), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => deleteService.mutate({ service_id: s.id, account_id: accountId })}
                  disabled={deleteService.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

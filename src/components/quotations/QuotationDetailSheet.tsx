import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Trash2, Building2, Calendar, FileText, Activity } from 'lucide-react';
import { format } from 'date-fns';
import {
  useQuotation,
  useUpdateQuotation,
  useUpdateQuotationStatus,
  useAddQuotationItem,
  useUpdateQuotationItem,
  useRemoveQuotationItem,
  QUOTATION_STATUSES,
  QUOTATION_CURRENCIES,
  type QuotationStatus,
} from '@/hooks/useQuotations';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  quotationId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ACCOUNTING_ROLES = ['head_of_accounting', 'accounting_employee'];

function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatMoney(amount: number | null, currency: string) {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function QuotationDetailSheet({ quotationId, open, onOpenChange }: Props) {
  const { roles } = useAuth();
  const isAccounting = roles.some((r) => ACCOUNTING_ROLES.includes(r));

  const { data, isLoading } = useQuotation(quotationId);
  const updateQuotation = useUpdateQuotation();
  const updateStatus = useUpdateQuotationStatus();
  const addItem = useAddQuotationItem();
  const updateItem = useUpdateQuotationItem();
  const removeItem = useRemoveQuotationItem();

  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [totalOverride, setTotalOverride] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    if (data?.quotation) {
      setNotes(data.quotation.notes || '');
      setCurrency(data.quotation.currency || 'USD');
      setTotalOverride(data.quotation.total_amount != null ? String(data.quotation.total_amount) : '');
    }
  }, [data?.quotation]);

  if (!quotationId) return null;

  const q = data?.quotation;
  const items = data?.items || [];
  const account = data?.account as { name?: string; email?: string; phone?: string; country_name?: string } | null;
  const requester = data?.requester;
  const activities = data?.activities || [];

  const sb = q ? QUOTATION_STATUSES.find((s) => s.value === q.status) : null;

  const handleSaveMeta = () => {
    if (!q) return;
    const t = totalOverride.trim() ? Number(totalOverride) : null;
    updateQuotation.mutate({
      id: q.id,
      notes: notes || null,
      currency,
      total_amount: t != null && !Number.isNaN(t) ? t : null,
    });
  };

  const handleStatusChange = (next: QuotationStatus) => {
    if (!q) return;
    updateStatus.mutate({ id: q.id, status: next });
  };

  const handleAddItem = () => {
    if (!q || !newItemName.trim()) return;
    addItem.mutate({ quotation_id: q.id, service_name: newItemName.trim(), quantity: 1 });
    setNewItemName('');
  };

  const computedTotal = items.reduce((sum, it) => sum + (it.line_total ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !q ? (
          <div className="py-12 text-center text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <SheetTitle className="font-mono text-base">{q.reference || q.id.slice(0, 8)}</SheetTitle>
                  <p className="text-sm text-muted-foreground mt-1">{account?.name || 'Unknown account'}</p>
                </div>
                {sb && <Badge variant="outline" className={`${sb.tone}`}>{sb.label}</Badge>}
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Status control */}
              {isAccounting && (
                <div>
                  <Label className="text-xs">Update status</Label>
                  <Select value={q.status} onValueChange={(v) => handleStatusChange(v as QuotationStatus)}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUOTATION_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Account snapshot */}
              <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Building2 className="h-4 w-4 text-muted-foreground" /> Account
                </div>
                <div className="text-sm text-foreground">{account?.name || '—'}</div>
                {(account?.email || account?.phone) && (
                  <div className="text-xs text-muted-foreground">
                    {[account?.email, account?.phone, account?.country_name].filter(Boolean).join(' · ')}
                  </div>
                )}
                {requester && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={requester.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {initials(requester.display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs">
                      <div className="font-medium">{requester.display_name || requester.email}</div>
                      <div className="text-muted-foreground">Requested {format(new Date(q.created_at), 'MMM d, yyyy')}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileText className="h-4 w-4 text-muted-foreground" /> Line items
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="border rounded-lg divide-y">
                  {items.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground text-center">No items.</div>
                  )}
                  {items.map((it) => (
                    <div key={it.id} className="p-3 grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-5">
                        {isAccounting ? (
                          <Input
                            className="h-8 text-sm"
                            defaultValue={it.service_name}
                            onBlur={(e) => {
                              if (e.target.value !== it.service_name) {
                                updateItem.mutate({ item_id: it.id, quotation_id: q.id, service_name: e.target.value });
                              }
                            }}
                          />
                        ) : (
                          <div className="text-sm font-medium text-foreground">{it.service_name}</div>
                        )}
                        {it.description && <div className="text-xs text-muted-foreground mt-1">{it.description}</div>}
                      </div>
                      <div className="col-span-2">
                        {isAccounting ? (
                          <Input
                            type="number"
                            min={1}
                            className="h-8 text-sm"
                            defaultValue={it.quantity}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v && v !== it.quantity) {
                                updateItem.mutate({ item_id: it.id, quotation_id: q.id, quantity: v });
                              }
                            }}
                          />
                        ) : (
                          <div className="text-sm">×{it.quantity}</div>
                        )}
                      </div>
                      <div className="col-span-3">
                        {isAccounting ? (
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Unit price"
                            className="h-8 text-sm"
                            defaultValue={it.unit_price ?? ''}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const v = raw ? Number(raw) : null;
                              if (v !== it.unit_price) {
                                updateItem.mutate({ item_id: it.id, quotation_id: q.id, unit_price: v });
                              }
                            }}
                          />
                        ) : (
                          <div className="text-sm text-right">{formatMoney(it.unit_price, q.currency)}</div>
                        )}
                      </div>
                      <div className="col-span-1 text-right text-sm font-medium pt-1.5">
                        {it.line_total != null ? formatMoney(it.line_total, q.currency) : '—'}
                      </div>
                      <div className="col-span-1 text-right">
                        {isAccounting && (
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeItem.mutate({ item_id: it.id, quotation_id: q.id })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {isAccounting && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      className="h-8 text-sm flex-1"
                      placeholder="New service name"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
                    />
                    <Button size="sm" onClick={handleAddItem} disabled={!newItemName.trim() || addItem.isPending}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 mt-3 text-sm">
                  <span className="text-muted-foreground">Computed:</span>
                  <span className="font-semibold">{formatMoney(computedTotal, q.currency)}</span>
                </div>
              </div>

              <Separator />

              {/* Notes / currency / override (accounting) */}
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!isAccounting}
                  placeholder="Internal notes…"
                />
                {isAccounting && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Currency</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUOTATION_CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Total override (optional)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Leave blank to use computed"
                        value={totalOverride}
                        onChange={(e) => setTotalOverride(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {isAccounting && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveMeta} disabled={updateQuotation.isPending}>
                      {updateQuotation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              {/* Activity timeline */}
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
                  <Activity className="h-4 w-4 text-muted-foreground" /> Activity
                </div>
                <div className="space-y-2">
                  {activities.length === 0 && (
                    <p className="text-xs text-muted-foreground">No activity yet.</p>
                  )}
                  {activities.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs border-l-2 border-border pl-3 py-1">
                      <Calendar className="h-3 w-3 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <div className="text-foreground">{a.title}</div>
                        <div className="text-muted-foreground">
                          {format(new Date(a.created_at), 'MMM d, yyyy · HH:mm')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

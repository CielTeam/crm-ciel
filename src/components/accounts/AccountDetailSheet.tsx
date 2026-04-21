import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Building2, Globe, Mail, MapPin, Phone, User, Pencil, Save, X, Trash2, Phone as PhoneIcon, Users, StickyNote, AlertTriangle, FileText, Wrench } from 'lucide-react';
import { useUpdateAccount, useDeleteAccount, useAccountActivities } from '@/hooks/useAccountsContacts';
import type { AccountWithContacts } from '@/hooks/useAccountsContacts';
import { CountryCombobox } from '@/components/shared/CountryCombobox';
import { AccountNotesPanel } from './AccountNotesPanel';
import { AccountActivityTimeline } from './AccountActivityTimeline';
import { AccountSolutionsPanel } from './AccountSolutionsPanel';
import { DocumentsTab } from '@/components/shared/DocumentsTab';
import { toast } from 'sonner';

interface Props {
  account: AccountWithContacts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'pending', label: 'Pending' },
];
const TYPE_OPTS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'customer', label: 'Customer' },
  { value: 'partner', label: 'Partner' },
];
const HEALTH_OPTS = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'critical', label: 'Critical' },
];

const STATUS_TONE: Record<string, string> = {
  active: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  inactive: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
};
const HEALTH_TONE: Record<string, string> = {
  healthy: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30',
  at_risk: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <span className="text-muted-foreground">{label}</span>
        <p className="text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function AccountDetailSheet({ account, open, onOpenChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('details');
  const [prefillNoteType, setPrefillNoteType] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', industry: '', email: '', phone: '', website: '', city: '',
    country_code: null as string | null, country_name: '' as string,
    state_province: '', notes: '',
    account_status: 'active', account_type: 'prospect', account_health: 'healthy',
  });
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const { data: activities } = useAccountActivities(account?.id);

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name || '',
        industry: account.industry || '',
        email: account.email || '',
        phone: account.phone || '',
        website: account.website || '',
        city: account.city || '',
        country_code: account.country_code || null,
        country_name: account.country_name || account.country || '',
        state_province: account.state_province || '',
        notes: account.notes || '',
        account_status: account.account_status || 'active',
        account_type: account.account_type || 'prospect',
        account_health: account.account_health || 'healthy',
      });
      setEditing(false);
      setTab('details');
    }
  }, [account]);

  if (!account) return null;

  const handleSave = async () => {
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        name: form.name,
        industry: form.industry || null,
        email: form.email || null,
        phone: form.phone || null,
        website: form.website || null,
        city: form.city || null,
        country: form.country_name || null,
        country_code: form.country_code,
        country_name: form.country_name || null,
        state_province: form.state_province || null,
        notes: form.notes || null,
        account_status: form.account_status,
        account_type: form.account_type,
        account_health: form.account_health,
      });
      toast.success('Account updated');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const quickPatch = async (patch: Partial<{ account_status: string; account_type: string; account_health: string }>) => {
    try {
      await updateAccount.mutateAsync({ id: account.id, ...patch });
      setForm(f => ({ ...f, ...patch }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount.mutateAsync(account.id);
      onOpenChange(false);
    } catch { /* toast handled */ }
  };

  const openNoteWith = (type: string) => {
    setPrefillNoteType(type);
    setTab('notes');
  };

  const locationDisplay = [account.city, account.state_province, account.country_name || account.country].filter(Boolean).join(', ') || null;

  // Risk flags
  const lastActivityAt = activities && activities[0] ? new Date(activities[0].created_at) : null;
  const daysSinceActivity = lastActivityAt ? Math.floor((Date.now() - lastActivityAt.getTime()) / 86400000) : null;
  const flags: { label: string; tone: string }[] = [];
  if (!account.owner) flags.push({ label: 'No owner', tone: 'destructive' });
  if (account.contacts.length === 0) flags.push({ label: 'No contacts linked', tone: 'amber' });
  if (daysSinceActivity !== null && daysSinceActivity > 30) flags.push({ label: `${daysSinceActivity}d no activity`, tone: 'amber' });
  if (account.account_health === 'critical') flags.push({ label: 'Health critical', tone: 'destructive' });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="truncate">{editing ? 'Edit Account' : account.name}</span>
              </SheetTitle>
              {!editing && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge variant="outline" className={STATUS_TONE[account.account_status] || ''}>
                    {STATUS_OPTS.find(o => o.value === account.account_status)?.label || account.account_status}
                  </Badge>
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/30">
                    {TYPE_OPTS.find(o => o.value === account.account_type)?.label || account.account_type}
                  </Badge>
                  <Badge variant="outline" className={HEALTH_TONE[account.account_health] || ''}>
                    {HEALTH_OPTS.find(o => o.value === account.account_health)?.label || account.account_health}
                  </Badge>
                  {account.industry && <Badge variant="secondary" className="text-xs">{account.industry}</Badge>}
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
                      <AlertDialogTitle>Delete account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will archive "{account.name}" and its {account.contacts.length} linked contact(s). You can restore from the database if needed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)} disabled={updateAccount.isPending}>
                  <X className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleSave} disabled={updateAccount.isPending}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        {!editing && flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {flags.map((f, i) => (
              <Badge key={i} variant="outline" className={`text-[10px] gap-1 ${f.tone === 'destructive' ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-amber-500/10 text-amber-700 border-amber-500/30'}`}>
                <AlertTriangle className="h-2.5 w-2.5" /> {f.label}
              </Badge>
            ))}
          </div>
        )}

        {!editing && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openNoteWith('call_log')}>
              <PhoneIcon className="h-3.5 w-3.5 mr-1" /> Log Call
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNoteWith('email_log')}>
              <Mail className="h-3.5 w-3.5 mr-1" /> Log Email
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNoteWith('meeting_log')}>
              <Users className="h-3.5 w-3.5 mr-1" /> Log Meeting
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNoteWith('general')}>
              <StickyNote className="h-3.5 w-3.5 mr-1" /> Add Note
            </Button>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="mt-5">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({account.contacts.length})</TabsTrigger>
            <TabsTrigger value="solutions"><Wrench className="h-3.5 w-3.5 mr-1" />Solutions</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="documents"><FileText className="h-3.5 w-3.5 mr-1" />Docs</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-5">
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={form.account_status} onValueChange={(v) => setForm(f => ({ ...f, account_status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={form.account_type} onValueChange={(v) => setForm(f => ({ ...f, account_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Health</Label>
                    <Select value={form.account_health} onValueChange={(v) => setForm(f => ({ ...f, account_health: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{HEALTH_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Company Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Industry</Label>
                  <Input value={form.industry} onChange={(e) => setForm(f => ({ ...f, industry: e.target.value }))} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input value={form.website} onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} />
                </div>
                <div>
                  <Label>Country</Label>
                  <CountryCombobox
                    value={form.country_code}
                    onChange={(code, name) => setForm(f => ({ ...f, country_code: code, country_name: name || '' }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>State / Province</Label>
                    <Input value={form.state_province} onChange={(e) => setForm(f => ({ ...f, state_province: e.target.value }))} />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
                    <Select value={form.account_status} onValueChange={(v) => quickPatch({ account_status: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Type</Label>
                    <Select value={form.account_type} onValueChange={(v) => quickPatch({ account_type: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPE_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Health</Label>
                    <Select value={form.account_health} onValueChange={(v) => quickPatch({ account_health: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{HEALTH_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <InfoRow icon={Mail} label="Email" value={account.email} />
                  <InfoRow icon={Phone} label="Phone" value={account.phone} />
                  <InfoRow icon={Globe} label="Website" value={account.website} />
                  <InfoRow icon={MapPin} label="Location" value={locationDisplay} />
                </div>

                {account.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {account.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}

                {account.notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{account.notes}</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground pt-2">
                  Created {new Date(account.created_at).toLocaleDateString()}
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="mt-4">
            {account.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts linked.</p>
            ) : (
              <div className="space-y-3">
                {account.contacts.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{c.first_name} {c.last_name}</span>
                      {c.job_title && <Badge variant="outline" className="text-xs">{c.job_title}</Badge>}
                    </div>
                    {c.email && <p className="text-xs text-muted-foreground pl-6">{c.email}</p>}
                    {c.phone && <p className="text-xs text-muted-foreground pl-6">{c.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="solutions" className="mt-4">
            <AccountSolutionsPanel accountId={account.id} />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <AccountNotesPanel
              accountId={account.id}
              prefillNoteType={prefillNoteType}
              onPrefillConsumed={() => setPrefillNoteType(null)}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <DocumentsTab entityType="account" entityId={account.id} />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <AccountActivityTimeline accountId={account.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

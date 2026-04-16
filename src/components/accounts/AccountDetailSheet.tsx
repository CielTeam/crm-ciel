import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Building2, Globe, Mail, MapPin, Phone, User, Pencil, Save, X } from 'lucide-react';
import { useUpdateAccount } from '@/hooks/useAccountsContacts';
import type { AccountWithContacts } from '@/hooks/useAccountsContacts';
import { toast } from 'sonner';

interface Props {
  account: AccountWithContacts | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
  const [form, setForm] = useState({
    name: '', industry: '', email: '', phone: '', website: '', city: '', country: '', notes: '',
  });
  const updateAccount = useUpdateAccount();

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name || '',
        industry: account.industry || '',
        email: account.email || '',
        phone: account.phone || '',
        website: account.website || '',
        city: account.city || '',
        country: account.country || '',
        notes: account.notes || '',
      });
      setEditing(false);
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
        country: form.country || null,
        notes: form.notes || null,
      });
      toast.success('Account updated');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {editing ? 'Edit Account' : account.name}
            </SheetTitle>
            {!editing ? (
              <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
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

        <div className="mt-6 space-y-5">
          {editing ? (
            <div className="space-y-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={form.country} onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
            </div>
          ) : (
            <>
              {account.industry && <Badge variant="secondary">{account.industry}</Badge>}
              <div className="space-y-3">
                <InfoRow icon={Mail} label="Email" value={account.email} />
                <InfoRow icon={Phone} label="Phone" value={account.phone} />
                <InfoRow icon={Globe} label="Website" value={account.website} />
                <InfoRow icon={MapPin} label="Location" value={[account.city, account.country].filter(Boolean).join(', ') || null} />
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
            </>
          )}

          <Separator />

          <div>
            <h4 className="text-sm font-semibold mb-3">Contacts ({account.contacts.length})</h4>
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
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Created {new Date(account.created_at).toLocaleDateString()}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

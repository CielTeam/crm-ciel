import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, Globe, Mail, MapPin, Phone, User } from 'lucide-react';
import type { AccountWithContacts } from '@/hooks/useAccountsContacts';

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
  if (!account) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {account.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
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

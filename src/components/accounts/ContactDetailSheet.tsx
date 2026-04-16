import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Mail, Phone, User } from 'lucide-react';
import type { Contact } from '@/hooks/useAccountsContacts';

interface Props {
  contact: Contact | null;
  accountName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailSheet({ contact, accountName, open, onOpenChange }: Props) {
  if (!contact) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {contact.first_name} {contact.last_name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {contact.job_title && (
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{contact.job_title}</span>
            </div>
          )}

          {accountName && <Badge variant="secondary">{accountName}</Badge>}

          <div className="space-y-2">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{contact.phone}</span>
              </div>
            )}
            {contact.secondary_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{contact.secondary_phone}</span>
              </div>
            )}
          </div>

          {contact.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground pt-2">
            Created {new Date(contact.created_at).toLocaleDateString()}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

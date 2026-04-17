import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Briefcase, Mail, Phone, User, Pencil, Save, X, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useUpdateContact, useDeleteContact } from '@/hooks/useAccountsContacts';
import type { Contact } from '@/hooks/useAccountsContacts';
import { toast } from 'sonner';

interface Props {
  contact: Contact | null;
  accountName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailSheet({ contact, accountName, open, onOpenChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', secondary_phone: '', job_title: '', notes: '',
  });
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();

  useEffect(() => {
    if (contact) {
      setForm({
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        secondary_phone: contact.secondary_phone || '',
        job_title: contact.job_title || '',
        notes: contact.notes || '',
      });
      setEditing(false);
    }
  }, [contact]);

  if (!contact) return null;

  const handleSave = async () => {
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        secondary_phone: form.secondary_phone || null,
        job_title: form.job_title || null,
        notes: form.notes || null,
      });
      toast.success('Contact updated');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              {editing ? 'Edit Contact' : `${contact.first_name} ${contact.last_name}`}
            </SheetTitle>
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
                      <AlertDialogTitle>Delete contact?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will archive {contact.first_name} {contact.last_name}. You can restore from the database if needed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => { try { await deleteContact.mutateAsync(contact.id); onOpenChange(false); } catch { /* */ } }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)} disabled={updateContact.isPending}>
                  <X className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleSave} disabled={updateContact.isPending}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name *</Label>
                  <Input value={form.first_name} onChange={(e) => setForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Last Name *</Label>
                  <Input value={form.last_name} onChange={(e) => setForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Job Title</Label>
                <Input value={form.job_title} onChange={(e) => setForm(f => ({ ...f, job_title: e.target.value }))} />
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
                <Label>Secondary Phone</Label>
                <Input value={form.secondary_phone} onChange={(e) => setForm(f => ({ ...f, secondary_phone: e.target.value }))} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

          <p className="text-xs text-muted-foreground pt-2">
            Created {new Date(contact.created_at).toLocaleDateString()}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

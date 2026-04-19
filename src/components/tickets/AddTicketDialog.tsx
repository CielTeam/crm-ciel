import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  TICKET_TYPES, TICKET_PRIORITIES, TICKET_SOURCES,
  useCreateTicket, type TicketType, type TicketPriority, type TicketSource,
} from '@/hooks/useTickets';
import { useAccountsWithContacts } from '@/hooks/useAccountsContacts';
import { useDirectoryData } from '@/hooks/useDirectoryData';

const TYPE_LABEL: Record<TicketType, string> = {
  support: 'Support', incident: 'Incident', service_request: 'Service Request',
  maintenance: 'Maintenance', deployment: 'Deployment', bug_fix: 'Bug Fix', other: 'Other',
};
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
};
const SOURCE_LABEL: Record<TicketSource, string> = {
  internal: 'Internal', client: 'Client', email: 'Email', phone: 'Phone',
  whatsapp: 'WhatsApp', portal: 'Portal', other: 'Other',
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultType?: TicketType;
}

export function AddTicketDialog({ open, onOpenChange, defaultType = 'support' }: Props) {
  const [form, setForm] = useState({
    title: '', description: '',
    ticket_type: defaultType,
    priority: 'medium' as TicketPriority,
    source_channel: 'internal' as TicketSource,
    account_id: '' as string,
    contact_id: '' as string,
    assigned_to: '' as string,
    technical_owner_id: '' as string,
    support_duration_estimate_hours: '' as string,
  });

  const create = useCreateTicket();
  const { data: accounts } = useAccountsWithContacts();
  const { data: directory } = useDirectoryData();

  useEffect(() => {
    if (open) setForm((f) => ({ ...f, ticket_type: defaultType }));
  }, [open, defaultType]);

  // When account changes, clear contact if it doesn't belong
  useEffect(() => {
    if (!form.account_id) { setForm((f) => ({ ...f, contact_id: '' })); return; }
    const acct = accounts?.find((a) => a.id === form.account_id);
    if (acct && form.contact_id && !acct.contacts.some((c) => c.id === form.contact_id)) {
      setForm((f) => ({ ...f, contact_id: '' }));
    }
  }, [form.account_id, form.contact_id, accounts]);

  const availableContacts = useMemo(() => {
    if (!form.account_id) return [];
    return accounts?.find((a) => a.id === form.account_id)?.contacts ?? [];
  }, [form.account_id, accounts]);

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    create.mutate({
      title: form.title.trim(),
      description: form.description.trim() || null,
      ticket_type: form.ticket_type,
      priority: form.priority,
      source_channel: form.source_channel,
      account_id: form.account_id || null,
      contact_id: form.contact_id || null,
      assigned_to: form.assigned_to || null,
      technical_owner_id: form.technical_owner_id || null,
      support_duration_estimate_hours: form.support_duration_estimate_hours
        ? Number(form.support_duration_estimate_hours)
        : null,
    }, {
      onSuccess: () => {
        toast.success('Ticket created');
        onOpenChange(false);
        setForm({
          title: '', description: '',
          ticket_type: defaultType, priority: 'medium', source_channel: 'internal',
          account_id: '', contact_id: '', assigned_to: '', technical_owner_id: '',
          support_duration_estimate_hours: '',
        });
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to create ticket'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Ticket</DialogTitle>
          <DialogDescription>Create a support, incident, or work ticket.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Brief summary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              placeholder="Detailed description"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.ticket_type} onValueChange={(v) => setForm((f) => ({ ...f, ticket_type: v as TicketType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TicketPriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={form.source_channel} onValueChange={(v) => setForm((f) => ({ ...f, source_channel: v as TicketSource }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Account</Label>
              <Select
                value={form.account_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, account_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="No account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No account</SelectItem>
                  {accounts?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact {!form.account_id && <span className="text-xs text-muted-foreground">(select account first)</span>}</Label>
              <Select
                value={form.contact_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, contact_id: v === 'none' ? '' : v }))}
                disabled={!form.account_id}
              >
                <SelectTrigger><SelectValue placeholder="No contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No contact</SelectItem>
                  {availableContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select
                value={form.assigned_to || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, assigned_to: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {directory?.map((u) => <SelectItem key={u.userId} value={u.userId}>{u.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Technical owner</Label>
              <Select
                value={form.technical_owner_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, technical_owner_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {directory?.map((u) => <SelectItem key={u.userId} value={u.userId}>{u.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estimated effort (hours)</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={form.support_duration_estimate_hours}
              onChange={(e) => setForm((f) => ({ ...f, support_duration_estimate_hours: e.target.value }))}
              placeholder="e.g. 2"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Plus, User, UserPlus, Users } from 'lucide-react';
import { useAccountsWithContacts, type AccountWithContacts, type Contact } from '@/hooks/useAccountsContacts';
import { AccountDetailSheet } from '@/components/accounts/AccountDetailSheet';
import { ContactDetailSheet } from '@/components/accounts/ContactDetailSheet';
import { AddAccountDialog } from '@/components/accounts/AddAccountDialog';
import { AddContactDialog } from '@/components/accounts/AddContactDialog';
import { AccountsFilterBar, type AccountFilters } from '@/components/accounts/AccountsFilterBar';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  inactive: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
};
const TYPE_STYLES: Record<string, string> = {
  prospect: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  customer: 'bg-primary/15 text-primary border-primary/30',
  partner: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
};
const HEALTH_STYLES: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  at_risk: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
};

function LifecycleBadge({ value, kind }: { value?: string | null; kind: 'status' | 'type' | 'health' }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const map = kind === 'status' ? STATUS_STYLES : kind === 'type' ? TYPE_STYLES : HEALTH_STYLES;
  return (
    <Badge variant="outline" className={cn('text-xs capitalize', map[value] || '')}>
      {value.replace('_', ' ')}
    </Badge>
  );
}

export default function AccountsContactsPage() {
  const [filters, setFilters] = useState<AccountFilters>({});
  const { data: accounts, contacts, isLoading } = useAccountsWithContacts(filters);
  const [tab, setTab] = useState('accounts');
  const [selectedAccount, setSelectedAccount] = useState<AccountWithContacts | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);

  // Server filters apply to accounts list. Apply search to contacts client-side.
  const q = (filters.search || '').toLowerCase();
  const filteredContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          !q ||
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.job_title?.toLowerCase().includes(q),
      ),
    [contacts, q],
  );

  const accountNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    accounts.forEach((a) => (m[a.id] = a.name));
    return m;
  }, [accounts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Accounts & Contacts</h1>
          <p className="text-sm text-muted-foreground">Browse and manage converted entities from won leads</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Card className="px-3 py-1.5 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-semibold">{accounts.length}</span>
            <span className="text-muted-foreground">Accounts</span>
          </Card>
          <Card className="px-3 py-1.5 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="font-semibold">{contacts.length}</span>
            <span className="text-muted-foreground">Contacts</span>
          </Card>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-start justify-between">
        <div className="flex-1 min-w-0">
          <AccountsFilterBar filters={filters} onChange={setFilters} />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setAddContactOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" /> New Contact
          </Button>
          <Button size="sm" onClick={() => setAddAccountOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Account
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accounts">
            <Building2 className="h-4 w-4 mr-1.5" />
            Accounts ({accounts.length})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <User className="h-4 w-4 mr-1.5" />
            Contacts ({filteredContacts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No accounts found.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelectedAccount(a)}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.industry ? <Badge variant="outline" className="text-xs">{a.industry}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell><LifecycleBadge value={a.account_status} kind="status" /></TableCell>
                      <TableCell><LifecycleBadge value={a.account_type} kind="type" /></TableCell>
                      <TableCell><LifecycleBadge value={a.account_health} kind="health" /></TableCell>
                      <TableCell className="text-sm">{[a.city, a.state_province, a.country_name || a.country].filter(Boolean).join(', ') || '—'}</TableCell>
                      <TableCell className="text-right">{a.contacts.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredContacts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No contacts found.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Account</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedContact(c)}>
                      <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                      <TableCell>{c.job_title ? <Badge variant="outline" className="text-xs">{c.job_title}</Badge> : '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.email || '—'}</TableCell>
                      <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                      <TableCell className="text-sm">{c.account_id ? accountNameMap[c.account_id] || '—' : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AccountDetailSheet account={selectedAccount} open={!!selectedAccount} onOpenChange={(o) => !o && setSelectedAccount(null)} />
      <ContactDetailSheet contact={selectedContact} accountName={selectedContact?.account_id ? accountNameMap[selectedContact.account_id] : undefined} open={!!selectedContact} onOpenChange={(o) => !o && setSelectedContact(null)} />
      <AddAccountDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} />
      <AddContactDialog open={addContactOpen} onOpenChange={setAddContactOpen} accounts={accounts} />
    </div>
  );
}

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Search, User, Users } from 'lucide-react';
import { useAccountsWithContacts, type AccountWithContacts, type Contact } from '@/hooks/useAccountsContacts';
import { AccountDetailSheet } from '@/components/accounts/AccountDetailSheet';
import { ContactDetailSheet } from '@/components/accounts/ContactDetailSheet';

export default function AccountsContactsPage() {
  const { data: accounts, contacts, isLoading } = useAccountsWithContacts();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('accounts');
  const [selectedAccount, setSelectedAccount] = useState<AccountWithContacts | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const q = search.toLowerCase();

  const filteredAccounts = useMemo(
    () => accounts.filter((a) => a.name.toLowerCase().includes(q) || a.industry?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q)),
    [accounts, q],
  );

  const filteredContacts = useMemo(
    () => contacts.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.job_title?.toLowerCase().includes(q)),
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
          <p className="text-sm text-muted-foreground">Browse converted entities from won leads</p>
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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, industry..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accounts">
            <Building2 className="h-4 w-4 mr-1.5" />
            Accounts ({filteredAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <User className="h-4 w-4 mr-1.5" />
            Contacts ({filteredContacts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredAccounts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No accounts found.</CardContent></Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Contacts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelectedAccount(a)}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.industry ? <Badge variant="outline" className="text-xs">{a.industry}</Badge> : '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{a.email || '—'}</TableCell>
                      <TableCell className="text-sm">{[a.city, a.country].filter(Boolean).join(', ') || '—'}</TableCell>
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
    </div>
  );
}

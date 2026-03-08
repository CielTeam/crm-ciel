import { useState } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { UserPlus, Search, UserX, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import type { AdminUser } from '@/hooks/useAdminData';
import { useAdminAction } from '@/hooks/useAdminData';
import { APP_ROLES, ROLE_LABELS, type AppRole } from '@/types/roles';

interface UsersTableProps {
  users: AdminUser[];
  onAddUser: () => void;
}

export function UsersTable({ users, onAddUser }: UsersTableProps) {
  const [search, setSearch] = useState('');
  const { mutate, isPending } = useAdminAction();

  const filtered = users.filter(
    (u) =>
      !search ||
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleRoleChange = (userId: string, newRole: string) => {
    mutate({ action: 'update_role', target_user_id: userId, new_role: newRole as AppRole });
  };

  const handleToggleActive = (user: AdminUser) => {
    mutate({
      action: user.deletedAt ? 'reactivate_user' : 'deactivate_user',
      target_user_id: user.userId,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onAddUser} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id} className={u.deletedAt ? 'opacity-50' : ''}>
                <TableCell className="font-medium">{u.displayName}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Select
                    value={u.role || ''}
                    onValueChange={(v) => handleRoleChange(u.userId, v)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Assign role" />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant={u.deletedAt ? 'destructive' : 'secondary'}>
                    {u.deletedAt ? 'Deactivated' : u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(u.createdAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleActive(u)}
                    disabled={isPending}
                    title={u.deletedAt ? 'Reactivate' : 'Deactivate'}
                  >
                    {u.deletedAt ? (
                      <UserCheck className="h-4 w-4 text-success" />
                    ) : (
                      <UserX className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

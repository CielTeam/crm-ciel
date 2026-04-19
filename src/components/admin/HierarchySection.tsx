import { useState, useMemo } from 'react';
import { Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useDepartments, useManageDepartment, useUpdateProfileHierarchy, type Department } from '@/hooks/useDepartments';
import type { AdminUser } from '@/hooks/useAdminData';
import { toast } from 'sonner';

interface Props { users: AdminUser[]; }

export function HierarchySection({ users }: Props) {
  const { data: departments, isLoading } = useDepartments();
  const manage = useManageDepartment();
  const updateHierarchy = useUpdateProfileHierarchy();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: '', head_user_id: '', parent_department_id: '' });

  const userMap = useMemo(() => new Map(users.map((u) => [u.userId, u.displayName])), [users]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', head_user_id: '', parent_department_id: '' });
    setCreateOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setForm({
      name: d.name,
      head_user_id: d.head_user_id ?? '',
      parent_department_id: d.parent_department_id ?? '',
    });
    setCreateOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Department name is required'); return; }
    const payload = {
      name: form.name.trim(),
      head_user_id: form.head_user_id || null,
      parent_department_id: form.parent_department_id || null,
    };
    const action = editing
      ? { action: 'update_department' as const, id: editing.id, ...payload }
      : { action: 'create_department' as const, ...payload };
    manage.mutate(action, {
      onSuccess: () => { toast.success(editing ? 'Department updated' : 'Department created'); setCreateOpen(false); },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
    });
  };

  const handleDelete = (id: string) => {
    manage.mutate({ action: 'delete_department', id }, {
      onSuccess: () => toast.success('Department deleted'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to delete'),
    });
  };

  const handleAssignManager = (userId: string, managerId: string) => {
    updateHierarchy.mutate({ target_user_id: userId, manager_user_id: managerId === 'none' ? null : managerId }, {
      onSuccess: () => toast.success('Manager updated'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
    });
  };

  const handleAssignDept = (userId: string, deptId: string) => {
    updateHierarchy.mutate({ target_user_id: userId, department_id: deptId === 'none' ? null : deptId }, {
      onSuccess: () => toast.success('Department updated'),
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Departments</h3>
            <p className="text-sm text-muted-foreground">Organizational structure used for hierarchy-based visibility.</p>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Department
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(departments ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.head_user_id ? userMap.get(d.head_user_id) ?? d.head_user_id : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {d.parent_department_id ? departments?.find((x) => x.id === d.parent_department_id)?.name ?? '—' : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete department?</AlertDialogTitle>
                              <AlertDialogDescription>This cannot be undone. Users assigned to this department will be unassigned.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(d.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(departments?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No departments yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Reporting structure</h3>
          <p className="text-sm text-muted-foreground">Assign each user a department and manager.</p>
        </div>
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Manager</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.filter((u) => !u.deletedAt).map((u) => (
                <UserHierarchyRow
                  key={u.userId}
                  user={u}
                  departments={departments ?? []}
                  allUsers={users}
                  onChangeDept={(v) => handleAssignDept(u.userId, v)}
                  onChangeManager={(v) => handleAssignManager(u.userId, v)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Department' : 'New Department'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Head of department</Label>
              <Select
                value={form.head_user_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, head_user_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {users.filter((u) => !u.deletedAt).map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>{u.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Parent department</Label>
              <Select
                value={form.parent_department_id || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, parent_department_id: v === 'none' ? '' : v }))}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(departments ?? []).filter((d) => d.id !== editing?.id).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={manage.isPending}>
              {manage.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserHierarchyRow({ user, departments, allUsers, onChangeDept, onChangeManager }: {
  user: AdminUser; departments: Department[]; allUsers: AdminUser[];
  onChangeDept: (v: string) => void; onChangeManager: (v: string) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium text-sm">{user.displayName}</div>
        <div className="text-xs text-muted-foreground">{user.roleLabel}</div>
      </TableCell>
      <TableCell>
        <Select onValueChange={onChangeDept}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select onValueChange={onChangeManager}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="No manager" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No manager</SelectItem>
            {allUsers.filter((u) => !u.deletedAt && u.userId !== user.userId).map((u) => (
              <SelectItem key={u.userId} value={u.userId}>{u.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}

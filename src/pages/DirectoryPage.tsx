import { useState, useMemo } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { useDirectoryData, type DirectoryUser } from '@/hooks/useDirectoryData';
import { DirectoryFilters } from '@/components/directory/DirectoryFilters';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import { ProfileDetailSheet } from '@/components/directory/ProfileDetailSheet';

export default function DirectoryPage() {
  const { data: users, isLoading, error } = useDirectoryData();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);

  const filtered = useMemo(() => {
    if (!users) return [];
    return users.filter((u) => {
      const matchesSearch =
        !search ||
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesDept = department === 'all' || u.department === department;
      return matchesSearch && matchesDept;
    });
  }, [users, search, department]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Directory</h1>
        {users && (
          <span className="text-sm text-muted-foreground">
            ({filtered.length} of {users.length})
          </span>
        )}
      </div>

      <DirectoryFilters
        search={search}
        onSearchChange={setSearch}
        department={department}
        onDepartmentChange={setDepartment}
      />

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="text-center py-20 text-destructive">
          Failed to load directory. Please try again.
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No employees found matching your criteria.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((user) => (
          <DirectoryCard key={user.id} user={user} onClick={() => setSelectedUser(user)} />
        ))}
      </div>

      <ProfileDetailSheet
        user={selectedUser}
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
      />
    </div>
  );
}

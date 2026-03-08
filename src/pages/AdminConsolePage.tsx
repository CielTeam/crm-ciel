import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminUsers, useAdminTeams } from '@/hooks/useAdminData';
import { UsersTable } from '@/components/admin/UsersTable';
import { TeamsTable } from '@/components/admin/TeamsTable';
import { AddUserDialog } from '@/components/admin/AddUserDialog';
import { CreateTeamDialog } from '@/components/admin/CreateTeamDialog';

export default function AdminConsolePage() {
  const { data: users, isLoading: usersLoading } = useAdminUsers();
  const { data: teams, isLoading: teamsLoading } = useAdminTeams();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  const isLoading = usersLoading || teamsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Admin Console</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users ({users?.length || 0})</TabsTrigger>
            <TabsTrigger value="teams">Teams ({teams?.length || 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <UsersTable users={users || []} onAddUser={() => setAddUserOpen(true)} />
          </TabsContent>
          <TabsContent value="teams">
            <TeamsTable teams={teams || []} onCreateTeam={() => setCreateTeamOpen(true)} />
          </TabsContent>
        </Tabs>
      )}

      <AddUserDialog open={addUserOpen} onOpenChange={setAddUserOpen} />
      <CreateTeamDialog open={createTeamOpen} onOpenChange={setCreateTeamOpen} />
    </div>
  );
}

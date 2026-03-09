import { useState, useMemo } from 'react';
import { useLeaves, useLeaveBalances } from '@/hooks/useLeaves';
import { useAuth } from '@/contexts/AuthContext';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { LEAD_ROLES, EXECUTIVE_ROLES } from '@/types/roles';
import { LeaveBalanceCards } from '@/components/leaves/LeaveBalanceCards';
import { LeaveRequestDialog } from '@/components/leaves/LeaveRequestDialog';
import { LeaveCard } from '@/components/leaves/LeaveCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageError } from '@/components/PageError';
import { Loader2 } from 'lucide-react';

export default function LeavesPage() {
  const { roles } = useAuth();
  const isReviewer = roles.some(r => [...LEAD_ROLES, ...EXECUTIVE_ROLES, 'hr' as any].includes(r));

  const { data: myLeaves, isLoading: myLoading, error: myErr } = useLeaves(false);
  const { data: teamLeaves, isLoading: teamLoading } = useLeaves(isReviewer);
  const { data: balances, isLoading: balLoading } = useLeaveBalances();
  const { data: directoryUsers } = useDirectoryData();

  const [statusFilter, setStatusFilter] = useState<string>('all');

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    directoryUsers?.forEach(u => m.set(u.userId, u.displayName));
    return m;
  }, [directoryUsers]);

  const filterByStatus = (leaves: any[]) => {
    if (statusFilter === 'all') return leaves;
    return leaves.filter(l => l.status === statusFilter);
  };

  if (myErr) return <PageError message="Failed to load leaves" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Leaves</h1>
        <LeaveRequestDialog />
      </div>

      <LeaveBalanceCards balances={balances} isLoading={balLoading} />

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="my_leaves">
        <TabsList>
          <TabsTrigger value="my_leaves">My Leaves</TabsTrigger>
          {isReviewer && <TabsTrigger value="team">Team Requests</TabsTrigger>}
        </TabsList>

        <TabsContent value="my_leaves" className="space-y-3 mt-4">
          {myLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filterByStatus(myLeaves || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No leave requests found</p>
          ) : (
            filterByStatus(myLeaves || []).map(leave => (
              <LeaveCard key={leave.id} leave={leave} />
            ))
          )}
        </TabsContent>

        {isReviewer && (
          <TabsContent value="team" className="space-y-3 mt-4">
            {teamLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filterByStatus(teamLeaves || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No team leave requests</p>
            ) : (
              filterByStatus(teamLeaves || []).map(leave => (
                <LeaveCard key={leave.id} leave={leave} showReviewActions userName={userMap.get(leave.user_id) || 'Unknown'} />
              ))
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

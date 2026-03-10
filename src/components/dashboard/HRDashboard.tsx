import { Users, Palmtree, CheckSquare, Bell, Calendar, ShieldAlert } from 'lucide-react';
import { StatCard } from './StatCard';
import { QuickAccess } from './QuickAccess';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardStats } from '@/hooks/useDashboardStats';

export function HRDashboard({ stats }: { stats: DashboardStats }) {
  const topStats = [
    { label: 'Total Employees', value: stats.totalEmployees ?? 0, icon: Users, iconColor: 'text-primary' },
    { label: 'Pending Leave Requests', value: stats.orgPendingLeaves ?? 0, icon: Palmtree, iconColor: 'text-warning' },
    { label: 'Approved This Month', value: stats.approvedThisMonth ?? 0, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'On Leave Today', value: stats.onLeaveToday ?? 0, icon: ShieldAlert, iconColor: 'text-destructive' },
  ];

  const personalStats = [
    { label: 'My Open Tasks', value: stats.openTasks, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'My Pending Leaves', value: stats.pendingLeaves, icon: Palmtree, iconColor: 'text-warning' },
    { label: 'Unread Notifications', value: stats.unreadMessages, icon: Bell, iconColor: 'text-primary' },
    { label: 'Upcoming Meetings', value: '—', icon: Calendar, iconColor: 'text-info' },
  ];

  const leaveByType = stats.leaveByType || {};

  return (
    <div className="space-y-6">
      {/* HR Overview */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">HR Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topStats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </div>

      {/* Personal stats */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Personal</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {personalStats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave by type */}
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Leave Overview by Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(leaveByType).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No leave data</p>
            ) : (
              Object.entries(leaveByType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between p-2">
                  <span className="text-sm text-foreground capitalize">{type}</span>
                  <Badge variant="outline" className="text-xs">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pending leave approvals */}
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Pending Leave Requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats.pendingLeaveList || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No pending requests</p>
            ) : (
              (stats.pendingLeaveList || []).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{l.displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{l.leave_type} • {l.start_date} → {l.end_date}</p>
                  </div>
                  <Badge variant="outline" className="bg-warning/15 text-warning text-[10px] shrink-0">Pending</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <QuickAccess />
    </div>
  );
}

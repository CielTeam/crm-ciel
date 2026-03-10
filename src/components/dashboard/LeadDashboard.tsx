import { CheckSquare, Palmtree, Bell, Users, AlertTriangle, Calendar } from 'lucide-react';
import { StatCard } from './StatCard';
import { QuickAccess } from './QuickAccess';
import { RecentTasksList } from './RecentTasksList';
import { TeamWorkloadList } from './TeamWorkloadList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardStats } from '@/hooks/useDashboardStats';

export function LeadDashboard({ stats }: { stats: DashboardStats }) {
  const topStats = [
    { label: 'Team Open Tasks', value: stats.teamOpenTasks ?? 0, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'Team Pending Leaves', value: stats.teamPendingLeaves ?? 0, icon: Palmtree, iconColor: 'text-warning' },
    { label: 'Overdue Tasks', value: stats.teamOverdue ?? 0, icon: AlertTriangle, iconColor: 'text-destructive' },
    { label: 'Team Size', value: stats.teamSize ?? 0, icon: Users, iconColor: 'text-primary' },
  ];

  const personalStats = [
    { label: 'My Open Tasks', value: stats.openTasks, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'My Pending Leaves', value: stats.pendingLeaves, icon: Palmtree, iconColor: 'text-warning' },
    { label: 'Unread Notifications', value: stats.unreadMessages, icon: Bell, iconColor: 'text-primary' },
    { label: 'Upcoming Meetings', value: '—', icon: Calendar, iconColor: 'text-info' },
  ];

  return (
    <div className="space-y-6">
      {/* Team stats */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Team Overview</h3>
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
        <TeamWorkloadList members={stats.teamWorkload || []} />

        {/* Pending approvals */}
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stats.pendingApprovals || []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No pending approvals</p>
            ) : (
              (stats.pendingApprovals || []).map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.displayName || 'Employee'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.leave_type} leave • {a.start_date} → {a.end_date}</p>
                  </div>
                  <Badge variant="outline" className="bg-warning/15 text-warning text-[10px] shrink-0">Pending</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <QuickAccess />
      <RecentTasksList tasks={stats.recentTasks || []} />
    </div>
  );
}

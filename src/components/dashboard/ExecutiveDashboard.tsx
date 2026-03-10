import { Users, Building2, CheckSquare, Palmtree, AlertTriangle, Bell, Calendar } from 'lucide-react';
import { StatCard } from './StatCard';
import { QuickAccess } from './QuickAccess';
import { DepartmentScorecard } from './DepartmentScorecard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardStats } from '@/hooks/useDashboardStats';

export function ExecutiveDashboard({ stats }: { stats: DashboardStats }) {
  const topStats = [
    { label: 'Total Employees', value: stats.totalEmployees ?? 0, icon: Users, iconColor: 'text-primary' },
    { label: 'Departments', value: stats.totalDepartments ?? 0, icon: Building2, iconColor: 'text-info' },
    { label: 'Org Open Tasks', value: stats.orgOpenTasks ?? 0, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'Pending Leaves', value: stats.orgPendingLeaves ?? 0, icon: Palmtree, iconColor: 'text-warning' },
  ];

  const personalStats = [
    { label: 'My Open Tasks', value: stats.openTasks, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'My Pending Leaves', value: stats.pendingLeaves, icon: Palmtree, iconColor: 'text-warning' },
    { label: 'Unread Notifications', value: stats.unreadMessages, icon: Bell, iconColor: 'text-primary' },
    { label: 'Overdue Critical', value: stats.orgOverdueCritical ?? 0, icon: AlertTriangle, iconColor: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      {/* Org-wide stats */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Organization Overview</h3>
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

      {/* Department scorecards */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Department Scorecards</h3>
        <DepartmentScorecard departments={stats.departments || []} />
      </div>

      {/* Escalations */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Escalations — Overdue Critical Tasks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(stats.escalations || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No critical overdue tasks ✓</p>
          ) : (
            (stats.escalations || []).map((e) => (
              <div key={e.id} className="flex items-center justify-between p-2 rounded-md bg-destructive/5 border border-destructive/10">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned to {e.assigneeName} • Due {e.due_date ? new Date(e.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
                  </p>
                </div>
                <Badge variant="destructive" className="text-[10px] shrink-0">Critical</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <QuickAccess />
    </div>
  );
}

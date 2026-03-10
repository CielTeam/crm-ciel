import { CheckSquare, Truck, Clock, CheckCircle, Bell } from 'lucide-react';
import { StatCard } from './StatCard';
import { QuickAccess } from './QuickAccess';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MessageSquare, Palmtree } from 'lucide-react';
import type { DashboardStats } from '@/hooks/useDashboardStats';

const driverLinks = [
  { title: 'Calendar', icon: Calendar, path: '/calendar', color: 'text-info' },
  { title: 'Tasks', icon: CheckSquare, path: '/tasks', color: 'text-success' },
  { title: 'Messages', icon: MessageSquare, path: '/messages', color: 'text-primary' },
  { title: 'Leaves', icon: Palmtree, path: '/leaves', color: 'text-warning' },
];

const statusFlow: Record<string, { label: string; color: string }> = {
  todo: { label: 'Assigned', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', color: 'bg-primary/15 text-primary' },
  done: { label: 'Completed', color: 'bg-success/15 text-success' },
};

export function DriverDashboard({ stats }: { stats: DashboardStats }) {
  const topStats = [
    { label: 'Assigned Tasks', value: stats.assignedTasks ?? 0, icon: Truck, iconColor: 'text-primary' },
    { label: 'In Progress', value: stats.inProgress ?? 0, icon: Clock, iconColor: 'text-warning' },
    { label: 'Completed Today', value: stats.completedToday ?? 0, icon: CheckCircle, iconColor: 'text-success' },
    { label: 'Unread Notifications', value: stats.unreadMessages, icon: Bell, iconColor: 'text-info' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topStats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Driver task board */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Task Board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(stats.driverTasks || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No tasks assigned</p>
          ) : (
            (stats.driverTasks || []).map((t: any) => {
              const sf = statusFlow[t.status] || statusFlow.todo;
              return (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-md border bg-background hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                    {t.due_date && (
                      <p className="text-xs text-muted-foreground">
                        Due {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${sf.color}`}>{sf.label}</Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <QuickAccess links={driverLinks} />
    </div>
  );
}

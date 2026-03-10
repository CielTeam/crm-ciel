import { CheckSquare, Palmtree, Bell, Calendar } from 'lucide-react';
import { StatCard } from './StatCard';
import { QuickAccess } from './QuickAccess';
import { RecentTasksList } from './RecentTasksList';
import type { DashboardStats } from '@/hooks/useDashboardStats';

export function EmployeeDashboard({ stats }: { stats: DashboardStats }) {
  const statCards = [
    { label: 'Open Tasks', value: stats.openTasks, icon: CheckSquare, iconColor: 'text-success' },
    { label: 'Pending Leaves', value: stats.pendingLeaves, icon: Palmtree, iconColor: 'text-warning' },
    { label: 'Unread Notifications', value: stats.unreadMessages, icon: Bell, iconColor: 'text-primary' },
    { label: 'Upcoming Meetings', value: '—', icon: Calendar, iconColor: 'text-info' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>
      <QuickAccess />
      <RecentTasksList tasks={stats.recentTasks || []} />
    </div>
  );
}

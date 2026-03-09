import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/roles';
import { useTasks } from '@/hooks/useTasks';
import { useLeaves } from '@/hooks/useLeaves';
import { useConversations } from '@/hooks/useMessages';
import { LayoutDashboard, Calendar, CheckSquare, MessageSquare, Users, Palmtree } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

const quickLinks = [
  { title: 'Calendar', icon: Calendar, path: '/calendar', color: 'text-info' },
  { title: 'Tasks', icon: CheckSquare, path: '/tasks', color: 'text-success' },
  { title: 'Messages', icon: MessageSquare, path: '/messages', color: 'text-primary' },
  { title: 'Leaves', icon: Palmtree, path: '/leaves', color: 'text-warning' },
  { title: 'Directory', icon: Users, path: '/directory', color: 'text-muted-foreground' },
];

export default function DashboardHome() {
  const { user, primaryRole } = useAuth();
  const navigate = useNavigate();

  const { data: myTasks } = useTasks('my_tasks');
  const { data: assignedTasks } = useTasks('assigned');
  const { data: myLeaves } = useLeaves(false);
  const { data: conversations } = useConversations();

  const openTaskCount = useMemo(() => {
    const all = [...(myTasks || []), ...(assignedTasks || [])];
    const unique = new Map(all.map(t => [t.id, t]));
    return [...unique.values()].filter(t => t.status !== 'done').length;
  }, [myTasks, assignedTasks]);

  const pendingLeaveCount = useMemo(() => {
    return (myLeaves || []).filter(l => l.status === 'pending').length;
  }, [myLeaves]);

  const unreadMessageCount = useMemo(() => {
    return (conversations || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }, [conversations]);

  const stats = [
    { label: 'Open Tasks', value: openTaskCount, icon: CheckSquare },
    { label: 'Pending Leaves', value: pendingLeaveCount, icon: Palmtree },
    { label: 'Upcoming Meetings', value: '—', icon: Calendar },
    { label: 'Unread Messages', value: unreadMessageCount, icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.displayName?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {primaryRole ? ROLE_LABELS[primaryRole] : 'No role'} Dashboard • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Quick Access</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {quickLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border bg-background hover:bg-muted transition-colors"
              >
                <link.icon className={`h-5 w-5 ${link.color}`} />
                <span className="text-xs font-medium text-foreground">{link.title}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <LayoutDashboard className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Activity feed will appear here</p>
            <p className="text-xs mt-1">Tasks, meetings, and updates from your team</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

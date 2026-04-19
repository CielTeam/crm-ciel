import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Check, CheckCheck, Palmtree, CheckSquare, MessageSquare, Loader2, ExternalLink } from 'lucide-react';
import { useNotifications, useMarkRead } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';

const REFERENCE_ROUTES: Record<string, string> = {
  leave: '/leaves',
  task: '/tasks',
  conversation: '/messages',
  calendar_event: '/calendar',
};

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  leave_approved: { icon: Palmtree, color: 'text-success', label: 'Leave Approved' },
  leave_rejected: { icon: Palmtree, color: 'text-destructive', label: 'Leave Rejected' },
  task_assigned: { icon: CheckSquare, color: 'text-primary', label: 'Task Assigned' },
  new_message: { icon: MessageSquare, color: 'text-info', label: 'New Message' },
  event_reminder: { icon: Bell, color: 'text-info', label: 'Event Reminder' },
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const { data: notifications = [], isLoading } = useNotifications(filter);
  const markRead = useMarkRead();

  const navigate = useNavigate();

  const handleClick = (n: { reference_type: string | null; reference_id: string | null; id: string; is_read: boolean }) => {
    if (!n.is_read) markRead.mutate(n.id);
    const route = n.reference_type ? REFERENCE_ROUTES[n.reference_type] : null;
    if (route) {
      if (n.reference_type === 'calendar_event' && n.reference_id) {
        navigate(`${route}?event=${n.reference_id}`);
      } else {
        navigate(route);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markRead.mutate(undefined)}
          disabled={markRead.isPending}
        >
          <CheckCheck className="h-4 w-4 mr-1.5" />
          Mark all read
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="read">Read</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : notifications.length === 0 ? (
        <Card className="border">
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Bell className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No notifications</p>
            <p className="text-sm mt-1">You're all caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const config = TYPE_CONFIG[n.type] || { icon: Bell, color: 'text-muted-foreground', label: n.type };
            const Icon = config.icon;

            return (
              <Card
                key={n.id}
                className={`border transition-colors cursor-pointer hover:shadow-sm ${!n.is_read ? 'bg-primary/5 border-primary/20' : ''}`}
                onClick={() => handleClick(n)}
              >
                <CardContent className="flex items-start gap-3 py-3 px-4">
                  <div className={`mt-0.5 ${config.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] font-medium">
                        {config.label}
                      </Badge>
                      {!n.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-8 w-8 p-0"
                      onClick={() => markRead.mutate(n.id)}
                      disabled={markRead.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

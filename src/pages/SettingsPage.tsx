import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MessageSquare, ListTodo, Bell } from 'lucide-react';
import { useSoundPreferences } from '@/hooks/useSoundPreferences';

export default function SettingsPage() {
  const { user, roles } = useAuth();
  const soundPrefs = useSoundPreferences();

  const initials = user?.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Profile & Settings</h1>

      <Card className="border">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.avatarUrl} />
              <AvatarFallback className="text-lg bg-primary text-primary-foreground font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold text-foreground">{user?.displayName || 'User'}</p>
              <p className="text-sm text-muted-foreground">{user?.email || 'No email'}</p>
              <div className="flex gap-1 mt-1">
                {roles.map((role) => (
                  <Badge key={role} variant="secondary" className="text-[10px]">
                    {ROLE_LABELS[role]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Notification Sounds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-messages" className="text-sm font-medium">Message sounds</Label>
                <p className="text-xs text-muted-foreground">Play a sound when you receive a new message</p>
              </div>
            </div>
            <Switch
              id="sound-messages"
              checked={soundPrefs.messages}
              onCheckedChange={() => soundPrefs.toggle('messages')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ListTodo className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-tasks" className="text-sm font-medium">Task sounds</Label>
                <p className="text-xs text-muted-foreground">Play a sound for task assignments and status changes</p>
              </div>
            </div>
            <Switch
              id="sound-tasks"
              checked={soundPrefs.tasks}
              onCheckedChange={() => soundPrefs.toggle('tasks')}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label htmlFor="sound-notifications" className="text-sm font-medium">Notification sounds</Label>
                <p className="text-xs text-muted-foreground">Play a sound for general notifications (leaves, etc.)</p>
              </div>
            </div>
            <Switch
              id="sound-notifications"
              checked={soundPrefs.notifications}
              onCheckedChange={() => soundPrefs.toggle('notifications')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

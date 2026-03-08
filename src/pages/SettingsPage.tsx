import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/types/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const { user, primaryRole, roles } = useAuth();

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
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Settings className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">Additional settings coming soon</p>
          <p className="text-xs mt-1">Notification preferences, working hours, and more.</p>
        </CardContent>
      </Card>
    </div>
  );
}

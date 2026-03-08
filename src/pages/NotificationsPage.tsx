import { Card, CardContent } from '@/components/ui/card';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Bell className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Notifications Coming Soon</p>
          <p className="text-sm mt-1">In-app alerts for tasks, meetings, leaves, and messages.</p>
        </CardContent>
      </Card>
    </div>
  );
}

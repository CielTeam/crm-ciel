import { Card, CardContent } from '@/components/ui/card';
import { Video } from 'lucide-react';

export default function MeetingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Meetings</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Video className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Meetings Coming Soon</p>
          <p className="text-sm mt-1">Schedule meetings with availability checks and Google Meet integration.</p>
        </CardContent>
      </Card>
    </div>
  );
}

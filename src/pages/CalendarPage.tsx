import { Card, CardContent } from '@/components/ui/card';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CalendarIcon className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Calendar Coming Soon</p>
          <p className="text-sm mt-1">Day, week, and month views with meetings, leaves, and blocks.</p>
        </CardContent>
      </Card>
    </div>
  );
}

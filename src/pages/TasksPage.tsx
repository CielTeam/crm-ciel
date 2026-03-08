import { Card, CardContent } from '@/components/ui/card';
import { CheckSquare } from 'lucide-react';

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Tasks Coming Soon</p>
          <p className="text-sm mt-1">Personal to-dos and assigned work with full lifecycle management.</p>
        </CardContent>
      </Card>
    </div>
  );
}

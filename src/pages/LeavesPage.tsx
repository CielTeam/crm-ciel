import { Card, CardContent } from '@/components/ui/card';
import { Palmtree } from 'lucide-react';

export default function LeavesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Leaves</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Palmtree className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Leaves Coming Soon</p>
          <p className="text-sm mt-1">Submit and track leave requests with approval workflows.</p>
        </CardContent>
      </Card>
    </div>
  );
}

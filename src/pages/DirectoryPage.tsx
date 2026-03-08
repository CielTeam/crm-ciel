import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';

export default function DirectoryPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Directory</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Directory Coming Soon</p>
          <p className="text-sm mt-1">Organization user list with search and contact actions.</p>
        </CardContent>
      </Card>
    </div>
  );
}

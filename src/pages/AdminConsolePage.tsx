import { Card, CardContent } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function AdminConsolePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Admin Console</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Shield className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Admin Console Coming Soon</p>
          <p className="text-sm mt-1">Manage users, roles, teams, and system settings.</p>
        </CardContent>
      </Card>
    </div>
  );
}

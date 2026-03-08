import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export default function MessagesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Messages</h1>
      <Card className="border">
        <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">Messages Coming Soon</p>
          <p className="text-sm mt-1">Direct and group conversations with threading and mentions.</p>
        </CardContent>
      </Card>
    </div>
  );
}

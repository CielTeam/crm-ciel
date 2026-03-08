import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Mail, Phone, Building2, Users, Calendar } from 'lucide-react';
import type { DirectoryUser } from '@/hooks/useDirectoryData';
import { format } from 'date-fns';

interface ProfileDetailSheetProps {
  user: DirectoryUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

const DEPT_LABELS: Record<string, string> = {
  executive: 'Executive', hr: 'HR', operations: 'Operations',
  development: 'Development', technical: 'Technical', accounting: 'Accounting',
  marketing: 'Marketing', sales: 'Sales', logistics: 'Logistics',
};

export function ProfileDetailSheet({ user, open, onOpenChange }: ProfileDetailSheetProps) {
  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Profile Details</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex flex-col items-center gap-4">
          <Avatar className="h-20 w-20 border-4 border-border">
            <AvatarImage src={user.avatarUrl || undefined} alt={user.displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
              {getInitials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">{user.displayName}</h2>
            <Badge variant="secondary" className="mt-1">{user.roleLabel}</Badge>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="space-y-4">
          <DetailRow icon={Mail} label="Email" value={user.email} />
          <DetailRow icon={Phone} label="Phone" value={user.phone || 'Not set'} />
          <DetailRow icon={Building2} label="Department" value={DEPT_LABELS[user.department] || user.department} />
          <DetailRow icon={Users} label="Team" value={user.teamName || 'Unassigned'} />
          <DetailRow
            icon={Calendar}
            label="Joined"
            value={format(new Date(user.createdAt), 'MMM d, yyyy')}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

import { useAccountActivities } from '@/hooks/useAccountsContacts';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Plus, UserCheck, StickyNote, TrendingUp, Trash2, Activity } from 'lucide-react';

const ICONS: Record<string, typeof Plus> = {
  created: Plus,
  updated: TrendingUp,
  deleted: Trash2,
  note_added: StickyNote,
  contact_added: UserCheck,
  contact_removed: UserCheck,
  account_status_change: Activity,
  account_type_change: Activity,
  account_health_change: Activity,
};

function ChangeDisplay({ changes }: { changes: Record<string, { old: unknown; new: unknown }> }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {entries.map(([field, { old: oldVal, new: newVal }]) => (
        <div key={field} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground capitalize">{field.replace(/_/g, ' ')}:</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-destructive/5 text-destructive">{String(oldVal || '—')}</Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-[hsl(var(--success))]/5 text-[hsl(var(--success))]">{String(newVal || '—')}</Badge>
        </div>
      ))}
    </div>
  );
}

interface Props { accountId: string }

export function AccountActivityTimeline({ accountId }: Props) {
  const { data: activities, isLoading } = useAccountActivities(accountId);
  const { data: profiles } = useDirectoryData();

  const getName = (id: string) => profiles?.find(p => p.userId === id)?.displayName || id.slice(0, 8);
  const getInitials = (id: string) => getName(id).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (!activities || activities.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">No activity recorded yet.</div>;

  return (
    <div className="relative">
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-4">
        {activities.map((a) => {
          const Icon = ICONS[a.activity_type] || TrendingUp;
          return (
            <div key={a.id} className="relative flex gap-3 pl-2">
              <div className="relative z-10 flex-shrink-0">
                <Avatar className="h-8 w-8 border-2 border-background">
                  <AvatarFallback className="text-[10px] bg-muted">{getInitials(a.actor_id)}</AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{a.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{getName(a.actor_id)}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <ChangeDisplay changes={a.changes} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

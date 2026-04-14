import { useLeadActivities, type LeadActivity } from '@/hooks/useLeads';
import { useDirectoryData } from '@/hooks/useDirectoryData';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Plus, UserCheck, AlertTriangle, RotateCcw, StickyNote, TrendingUp } from 'lucide-react';

const ACTIVITY_ICONS: Record<string, typeof Plus> = {
  created: Plus,
  stage_change: TrendingUp,
  owner_change: UserCheck,
  lost: AlertTriangle,
  reopened: RotateCcw,
  note_added: StickyNote,
  updated: TrendingUp,
  service_added: Plus,
};

function ChangeDisplay({ changes }: { changes: Record<string, { old: unknown; new: unknown }> }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {entries.map(([field, { old: oldVal, new: newVal }]) => (
        <div key={field} className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground capitalize">{field.replace(/_/g, ' ')}:</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-destructive/5 text-destructive">
            {String(oldVal || '—')}
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-[hsl(var(--success))]/5 text-[hsl(var(--success))]">
            {String(newVal || '—')}
          </Badge>
        </div>
      ))}
    </div>
  );
}

interface Props {
  leadId: string;
}

export function LeadActivityTimeline({ leadId }: Props) {
  const { data: activities, isLoading } = useLeadActivities(leadId);
  const { data: profiles } = useDirectoryData();

  const getActorName = (actorId: string) => {
    const profile = profiles?.find(p => p.userId === actorId);
    return profile?.displayName || actorId.slice(0, 8);
  };

  const getActorInitials = (actorId: string) => {
    const name = getActorName(actorId);
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
      <div className="space-y-4">
        {activities.map((activity) => {
          const Icon = ACTIVITY_ICONS[activity.activity_type] || TrendingUp;
          return (
            <div key={activity.id} className="relative flex gap-3 pl-2">
              <div className="relative z-10 flex-shrink-0">
                <Avatar className="h-8 w-8 border-2 border-background">
                  <AvatarFallback className="text-[10px] bg-muted">
                    {getActorInitials(activity.actor_id)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex-1 min-w-0 pb-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{activity.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{getActorName(activity.actor_id)}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(activity.created_at), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <ChangeDisplay changes={activity.changes} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { cn } from '@/lib/utils';
import { CheckSquare, Palmtree, Video } from 'lucide-react';

interface Props {
  event: CalendarEvent;
  compact?: boolean;
}

const typeIcons = {
  task: CheckSquare,
  leave: Palmtree,
  meeting: Video,
};

const colorMap: Record<string, string> = {
  primary: 'bg-primary/15 text-primary border-primary/20',
  success: 'bg-success/15 text-success border-success/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  destructive: 'bg-destructive/15 text-destructive border-destructive/20',
  info: 'bg-info/15 text-info border-info/20',
};

export function CalendarEventChip({ event, compact }: Props) {
  const Icon = typeIcons[event.type];
  const colors = colorMap[event.color] || colorMap.primary;

  if (compact) {
    return (
      <div className={cn('w-2 h-2 rounded-full shrink-0', {
        'bg-primary': event.color === 'primary',
        'bg-success': event.color === 'success',
        'bg-warning': event.color === 'warning',
        'bg-destructive': event.color === 'destructive',
        'bg-info': event.color === 'info',
      })} title={event.title} />
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border truncate', colors)}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{event.title}</span>
    </div>
  );
}

import type { CalendarEvent } from '@/hooks/useCalendarData';
import { cn } from '@/lib/utils';
import { CheckSquare, Palmtree, Video, Ticket } from 'lucide-react';

interface Props {
  event: CalendarEvent;
  compact?: boolean;
  onClick?: (event: CalendarEvent) => void;
}

const typeIcons = {
  task: CheckSquare,
  leave: Palmtree,
  meeting: Video,
  ticket: Ticket,
};

const colorMap: Record<string, string> = {
  primary: 'bg-primary/15 text-primary border-primary/20 hover:bg-primary/25',
  success: 'bg-success/15 text-success border-success/20 hover:bg-success/25',
  warning: 'bg-warning/15 text-warning border-warning/20 hover:bg-warning/25',
  destructive: 'bg-destructive/15 text-destructive border-destructive/20 hover:bg-destructive/25',
  info: 'bg-info/15 text-info border-info/20 hover:bg-info/25',
};

export function CalendarEventChip({ event, compact, onClick }: Props) {
  const Icon = typeIcons[event.type];
  const colors = colorMap[event.color] || colorMap.primary;

  const handleClick = (e: React.MouseEvent) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick(event);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn('w-2 h-2 rounded-full shrink-0 cursor-pointer', {
          'bg-primary': event.color === 'primary',
          'bg-success': event.color === 'success',
          'bg-warning': event.color === 'warning',
          'bg-destructive': event.color === 'destructive',
          'bg-info': event.color === 'info',
        })}
        title={event.title}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border truncate w-full text-left transition-colors cursor-pointer', colors)}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{event.title}</span>
    </button>
  );
}

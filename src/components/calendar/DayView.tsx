import { useMemo } from 'react';
import { format, isSameDay, isWithinInterval } from 'date-fns';
import type { CalendarEvent } from '@/hooks/useCalendarData';
import { CalendarEventChip } from './CalendarEventChip';
import { cn } from '@/lib/utils';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectEvent?: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ currentDate, events, onSelectEvent }: Props) {
  const dayEvents = useMemo(() => {
    return events.filter(e => {
      if (e.endDate) {
        return isWithinInterval(currentDate, { start: e.date, end: e.endDate });
      }
      return isSameDay(e.date, currentDate);
    });
  }, [currentDate, events]);

  const allDayEvents = dayEvents.filter(e => e.type === 'leave');
  const timedEvents = dayEvents.filter(e => e.type !== 'leave');

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-muted px-4 py-3 border-b">
        <p className="text-sm font-semibold text-foreground">{format(currentDate, 'EEEE, MMMM d, yyyy')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
      </div>

      {/* All day events */}
      {allDayEvents.length > 0 && (
        <div className="px-4 py-2 border-b bg-muted/30 space-y-1">
          <p className="text-[10px] text-muted-foreground font-medium">ALL DAY</p>
          {allDayEvents.map(ev => (
            <CalendarEventChip key={ev.id} event={ev} onClick={onSelectEvent} />
          ))}
        </div>
      )}

      {/* Time slots */}
      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.filter(h => h >= 7 && h <= 20).map(hour => {
          const hourEvents = hour === 9 ? timedEvents : [];
          return (
            <div key={hour} className="flex border-b min-h-[56px]">
              <div className="w-16 shrink-0 px-2 pt-1 text-xs text-muted-foreground text-right border-r">
                {format(new Date().setHours(hour, 0), 'h a')}
              </div>
              <div className="flex-1 p-1 space-y-0.5">
                {hourEvents.map(ev => (
                  <CalendarEventChip key={ev.id} event={ev} onClick={onSelectEvent} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

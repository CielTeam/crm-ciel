import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, isToday, isWithinInterval,
} from 'date-fns';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { CalendarEventChip } from './CalendarEventChip';
import { cn } from '@/lib/utils';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  selectedDate: Date | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({ currentDate, events, onSelectDate, selectedDate }: Props) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const start = startOfWeek(monthStart);
    const end = endOfWeek(monthEnd);
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const getEventsForDay = (day: Date) => {
    return events.filter(e => {
      if (e.endDate) {
        return isWithinInterval(day, { start: e.date, end: e.endDate });
      }
      return isSameDay(e.date, day);
    });
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 bg-muted">
        {WEEKDAYS.map(d => (
          <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-b">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = getEventsForDay(day);
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const selected = selectedDate && isSameDay(day, selectedDate);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={cn(
                'min-h-[100px] p-1.5 border-b border-r text-left transition-colors hover:bg-muted/50',
                !inMonth && 'bg-muted/30',
                selected && 'bg-accent/10 ring-1 ring-inset ring-accent',
              )}
            >
              <div className={cn(
                'text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                !inMonth && 'text-muted-foreground/40',
                today && 'bg-primary text-primary-foreground',
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => (
                  <CalendarEventChip key={ev.id} event={ev} />
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

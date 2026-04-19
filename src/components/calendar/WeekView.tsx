import { useMemo } from 'react';
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameDay, isToday, isWithinInterval,
} from 'date-fns';
import type { CalendarEvent } from '@/hooks/useCalendarData';
import { CalendarEventChip } from './CalendarEventChip';
import { cn } from '@/lib/utils';

interface Props {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
  selectedDate: Date | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ currentDate, events, onSelectDate, onSelectEvent, selectedDate }: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(currentDate);
    const end = endOfWeek(currentDate);
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
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted border-b">
        <div className="p-2" />
        {days.map(day => (
          <button
            key={day.toISOString()}
            onClick={() => onSelectDate(day)}
            className={cn(
              'p-2 text-center border-l hover:bg-muted/80 transition-colors',
              selectedDate && isSameDay(day, selectedDate) && 'bg-accent/10',
            )}
          >
            <p className="text-xs text-muted-foreground">{format(day, 'EEE')}</p>
            <p className={cn(
              'text-sm font-semibold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full mx-auto',
              isToday(day) && 'bg-primary text-primary-foreground',
            )}>
              {format(day, 'd')}
            </p>
          </button>
        ))}
      </div>

      {/* All-day events row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div className="p-1 text-[10px] text-muted-foreground flex items-center justify-center">All day</div>
        {days.map(day => {
          const dayEvents = getEventsForDay(day).filter(e => e.type === 'leave');
          return (
            <div key={day.toISOString()} className="p-1 border-l min-h-[32px] space-y-0.5">
              {dayEvents.slice(0, 2).map(ev => (
                <CalendarEventChip key={ev.id} event={ev} onClick={onSelectEvent} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.filter(h => h >= 7 && h <= 20).map(hour => (
            <div key={hour} className="contents">
              <div className="h-12 px-2 flex items-start justify-end pt-0.5 text-[10px] text-muted-foreground border-b">
                {format(new Date().setHours(hour, 0), 'ha')}
              </div>
              {days.map(day => {
                const dayEvents = hour === 9 ? getEventsForDay(day).filter(e => e.type !== 'leave') : [];
                return (
                  <div key={`${day.toISOString()}-${hour}`} className="h-12 border-l border-b relative">
                    {dayEvents.map(ev => (
                      <div key={ev.id} className="absolute inset-x-0.5 top-0.5">
                        <CalendarEventChip event={ev} onClick={onSelectEvent} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { useCalendarData, type CalendarEvent } from '@/hooks/useCalendarData';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import { AddEventDialog } from '@/components/calendar/AddEventDialog';
import { EventDetailSheet } from '@/components/calendar/EventDetailSheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(searchParams.get('event'));

  // Window for fetching
  const { from, to } = useMemo(() => {
    if (viewMode === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return { from: startOfWeek(ms), to: endOfWeek(me) };
    }
    if (viewMode === 'week') {
      return { from: startOfWeek(currentDate), to: endOfWeek(currentDate) };
    }
    return { from: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 0, 0, 0), to: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59) };
  }, [currentDate, viewMode]);

  const { data: events = [] } = useCalendarData(from, to);

  // Open detail from query param
  useEffect(() => {
    const ev = searchParams.get('event');
    if (ev && ev !== activeEventId) setActiveEventId(ev);
  }, [searchParams, activeEventId]);

  const navigateBy = useCallback((dir: 1 | -1) => {
    setCurrentDate(prev => {
      if (viewMode === 'month') return dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
      if (viewMode === 'week') return dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1);
      return dir === 1 ? addDays(prev, 1) : subDays(prev, 1);
    });
  }, [viewMode]);

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    if (viewMode === 'month') {
      setCurrentDate(date);
      setViewMode('day');
    }
  };

  const handleSelectEvent = (ev: CalendarEvent) => {
    if (ev.source === 'event') {
      setActiveEventId(ev.id);
      setSearchParams(p => { p.set('event', ev.id); return p; }, { replace: true });
    } else if (ev.source === 'ticket' && ev.linkedTicketId) {
      navigate(`/tickets?ticket=${ev.linkedTicketId}`);
    } else if (ev.source === 'task' && ev.linkedTaskId) {
      navigate(`/tasks?task=${ev.linkedTaskId}`);
    } else if (ev.source === 'leave') {
      navigate('/leaves');
    }
  };

  const closeDetail = (open: boolean) => {
    if (!open) {
      setActiveEventId(null);
      setSearchParams(p => { p.delete('event'); return p; }, { replace: true });
    }
  };

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : viewMode === 'week'
    ? `Week of ${format(currentDate, 'MMM d, yyyy')}`
    : format(currentDate, 'MMMM d, yyyy');

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground">Calendar</h1>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New event
          </Button>

          <Button variant="outline" size="sm" onClick={() => {
            setCurrentDate(new Date());
            setSelectedDate(new Date());
          }}>
            Today
          </Button>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBy(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground min-w-[160px] text-center">
              {headerLabel}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateBy(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Tabs value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="month" className="text-xs px-3 h-7">Month</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 h-7">Week</TabsTrigger>
              <TabsTrigger value="day" className="text-xs px-3 h-7">Day</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> Events</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-info" /> Tickets</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success" /> Approved leave</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-warning" /> Pending leave</span>
      </div>

      {/* View */}
      {viewMode === 'month' && (
        <MonthView currentDate={currentDate} events={events} onSelectDate={handleSelectDate} onSelectEvent={handleSelectEvent} selectedDate={selectedDate} />
      )}
      {viewMode === 'week' && (
        <WeekView currentDate={currentDate} events={events} onSelectDate={handleSelectDate} onSelectEvent={handleSelectEvent} selectedDate={selectedDate} />
      )}
      {viewMode === 'day' && (
        <DayView currentDate={currentDate} events={events} onSelectEvent={handleSelectEvent} />
      )}

      <AddEventDialog open={addOpen} onOpenChange={setAddOpen} defaultDate={selectedDate || currentDate} />
      <EventDetailSheet eventId={activeEventId} open={!!activeEventId} onOpenChange={closeDetail} />
    </div>
  );
}

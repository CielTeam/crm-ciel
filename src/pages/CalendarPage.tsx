import { useState, useCallback } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, format } from 'date-fns';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ViewMode = 'month' | 'week' | 'day';

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const events = useCalendarEvents();

  const navigate = useCallback((dir: 1 | -1) => {
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
          <Button variant="outline" size="sm" onClick={() => {
            setCurrentDate(new Date());
            setSelectedDate(new Date());
          }}>
            Today
          </Button>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground min-w-[160px] text-center">
              {headerLabel}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
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
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> Tasks</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success" /> Approved Leave</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-warning" /> Pending Leave</span>
      </div>

      {/* View */}
      {viewMode === 'month' && (
        <MonthView currentDate={currentDate} events={events} onSelectDate={handleSelectDate} selectedDate={selectedDate} />
      )}
      {viewMode === 'week' && (
        <WeekView currentDate={currentDate} events={events} onSelectDate={handleSelectDate} selectedDate={selectedDate} />
      )}
      {viewMode === 'day' && (
        <DayView currentDate={currentDate} events={events} />
      )}
    </div>
  );
}

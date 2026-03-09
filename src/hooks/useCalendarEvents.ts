import { useMemo } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useLeaves } from '@/hooks/useLeaves';
import { useAuth } from '@/contexts/AuthContext';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  type: 'task' | 'leave' | 'meeting';
  status?: string;
  priority?: string;
  color: string;
}

export function useCalendarEvents() {
  const { data: myTasks } = useTasks('my_tasks');
  const { data: assignedTasks } = useTasks('assigned');
  const { data: leaves } = useLeaves(false);

  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];
    const seen = new Set<string>();

    // Tasks with due dates
    const allTasks = [...(myTasks || []), ...(assignedTasks || [])];
    for (const t of allTasks) {
      if (seen.has(t.id) || !t.due_date) continue;
      seen.add(t.id);
      result.push({
        id: t.id,
        title: t.title,
        date: new Date(t.due_date),
        type: 'task',
        status: t.status,
        priority: t.priority,
        color: t.status === 'done' ? 'success' : t.priority === 'high' ? 'destructive' : 'primary',
      });
    }

    // Leaves (expand date range into per-day events)
    for (const l of leaves || []) {
      if (l.status === 'cancelled' || l.status === 'rejected') continue;
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      result.push({
        id: l.id,
        title: `${l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave`,
        date: start,
        endDate: end,
        type: 'leave',
        status: l.status,
        color: l.status === 'approved' ? 'success' : 'warning',
      });
    }

    return result.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [myTasks, assignedTasks, leaves]);

  return events;
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type CalendarEventSource = 'event' | 'task' | 'leave' | 'ticket';

export interface CalendarEvent {
  id: string;
  source: CalendarEventSource;
  title: string;
  date: Date;
  endDate?: Date;
  type: 'task' | 'leave' | 'meeting' | 'ticket';
  status?: string;
  priority?: string;
  color: string;
  eventType?: string;
  linkedAccountId?: string | null;
  linkedTicketId?: string | null;
  linkedTaskId?: string | null;
  visibility?: string;
  isOrganizer?: boolean;
  response?: string | null;
  allDay?: boolean;
}

interface ApiEvent {
  id: string;
  source: CalendarEventSource;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  event_type?: string;
  status?: string;
  priority?: string;
  color?: string;
  linked_account_id?: string | null;
  linked_ticket_id?: string | null;
  linked_task_id?: string | null;
  visibility?: string;
  is_organizer?: boolean;
  response?: string | null;
}

function toCalendarEvent(e: ApiEvent): CalendarEvent {
  const sourceTypeMap: Record<CalendarEventSource, CalendarEvent['type']> = {
    event: 'meeting',
    task: 'task',
    leave: 'leave',
    ticket: 'ticket',
  };
  return {
    id: e.id,
    source: e.source,
    title: e.title,
    date: new Date(e.start),
    endDate: e.end && e.end !== e.start ? new Date(e.end) : undefined,
    type: sourceTypeMap[e.source],
    status: e.status,
    priority: e.priority,
    color: e.color || 'primary',
    eventType: e.event_type,
    linkedAccountId: e.linked_account_id,
    linkedTicketId: e.linked_ticket_id,
    linkedTaskId: e.linked_task_id,
    visibility: e.visibility,
    isOrganizer: e.is_organizer,
    response: e.response,
    allDay: e.all_day,
  };
}

export function useCalendarData(from: Date, to: Date, includeAggregated = true) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['calendar-data', user?.id, from.toISOString(), to.toISOString(), includeAggregated],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'list', from: from.toISOString(), to: to.toISOString(), include_aggregated: includeAggregated },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return ((data?.events || []) as ApiEvent[]).map(toCalendarEvent);
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export interface CalendarEventDetails {
  event: {
    id: string;
    title: string;
    description: string | null;
    event_type: string;
    start_time: string;
    end_time: string;
    all_day: boolean;
    location: string | null;
    visibility: string;
    created_by: string;
    owner_user_id: string;
    account_id: string | null;
    ticket_id: string | null;
    task_id: string | null;
    color: string | null;
  };
  participants: Array<{ id: string; user_id: string; response: string; is_organizer: boolean }>;
  reminders: Array<{ id: string; channel: string; offset_minutes: number; fire_at: string; status: string }>;
}

export function useCalendarEventDetails(eventId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['calendar-event', eventId],
    queryFn: async (): Promise<CalendarEventDetails> => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'get', event_id: eventId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });
}

export interface CreateEventInput {
  title: string;
  description?: string;
  event_type?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  location?: string;
  visibility?: string;
  account_id?: string | null;
  ticket_id?: string | null;
  task_id?: string | null;
  participants?: string[];
  reminders?: Array<{ channel: 'in_app' | 'browser_push' | 'email'; offset_minutes: number }>;
}

export function useCreateEvent() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'create', ...input },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-data'] }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (input: { event_id: string } & Partial<CreateEventInput>) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'update', ...input },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['calendar-data'] });
      qc.invalidateQueries({ queryKey: ['calendar-event', vars.event_id] });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (event_id: string) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'delete', event_id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-data'] }),
  });
}

export function useRespondEvent() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (input: { event_id: string; response: 'accepted' | 'declined' | 'tentative' | 'pending' }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'respond', ...input },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['calendar-data'] });
      qc.invalidateQueries({ queryKey: ['calendar-event', vars.event_id] });
    },
  });
}

export function useAddReminder() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (input: { event_id: string; channel: 'in_app' | 'browser_push' | 'email'; offset_minutes: number }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'add_reminder', ...input },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['calendar-event', vars.event_id] }),
  });
}

export function useDeleteReminder(eventId?: string) {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (reminder_id: string) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('calendar-events', {
        body: { action: 'delete_reminder', reminder_id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      if (eventId) qc.invalidateQueries({ queryKey: ['calendar-event', eventId] });
    },
  });
}

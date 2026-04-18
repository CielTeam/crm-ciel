import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const TICKET_TYPES = ['support','incident','service_request','maintenance','deployment','bug_fix','other'] as const;
export const TICKET_STATUSES = ['open','in_progress','waiting','resolved','closed','archived'] as const;
export const TICKET_PRIORITIES = ['low','medium','high','urgent'] as const;
export const TICKET_SOURCES = ['internal','client','email','phone','whatsapp','portal','other'] as const;

export const SUPPORT_TYPES: readonly TicketType[] = ['support','maintenance','deployment','bug_fix','service_request'] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketSource = (typeof TICKET_SOURCES)[number];

// State machine — UI mirror
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress','waiting','resolved','closed','archived'],
  in_progress: ['waiting','resolved','closed','archived'],
  waiting: ['in_progress','resolved','closed','archived'],
  resolved: ['in_progress','closed','archived'],
  closed: ['in_progress','archived'],
  archived: [],
};
export function getAllowedTransitions(current: TicketStatus): TicketStatus[] {
  return ALLOWED_TRANSITIONS[current] || [];
}

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  ticket_type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  source_channel: TicketSource;
  account_id: string | null;
  contact_id: string | null;
  created_by: string;
  assigned_to: string | null;
  technical_owner_id: string | null;
  support_duration_estimate_hours: number | null;
  support_duration_actual_hours: number | null;
  resolution_summary: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  is_redacted: boolean;
  redacted_by: string | null;
  redacted_at: string | null;
  redaction_reason: string | null;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_avatar: string | null;
  redactor_name: string | null;
}

export interface TicketActivity {
  id: string;
  ticket_id: string;
  actor_id: string;
  activity_type: string;
  title: string;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name: string;
  actor_avatar: string | null;
}

export interface TicketsFilters {
  status?: TicketStatus[];
  ticket_type?: TicketType[];
  priority?: TicketPriority[];
  source_channel?: TicketSource[];
  account_id?: string | null;
  assigned_to?: string | null;
  technical_owner_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  search?: string | null;
  page?: number;
  page_size?: number;
}

function useInvoke() {
  const { getToken } = useAuth();
  return async (body: Record<string, unknown>) => {
    const token = await getToken();
    const { data, error } = await supabase.functions.invoke('tickets', {
      body, headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      const fnErr = error as { context?: { json: () => Promise<{ error?: string }> }; message?: string };
      const msg = fnErr.context ? await fnErr.context.json().catch(() => null) : null;
      throw new Error(msg?.error || fnErr.message || 'Request failed');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

export function useTickets(filters: TicketsFilters = {}) {
  const { user } = useAuth();
  const invoke = useInvoke();
  return useQuery({
    queryKey: ['tickets', filters, user?.id],
    queryFn: async () => {
      const data = await invoke({ action: 'list', ...filters });
      return data as { tickets: Ticket[]; total: number; page: number; page_size: number };
    },
    enabled: !!user?.id,
    placeholderData: keepPreviousData,
  });
}

export function useTicket(id: string | null) {
  const { user } = useAuth();
  const invoke = useInvoke();
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const data = await invoke({ action: 'get', id });
      return data.ticket as Ticket;
    },
    enabled: !!user?.id && !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: Partial<Ticket> & { title: string }) => {
      const data = await invoke({ action: 'create', ...payload });
      return data.ticket as Ticket;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: { id: string } & Partial<Ticket>) => {
      const data = await invoke({ action: 'update', ...payload });
      return data.ticket as Ticket;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket', v.id] });
    },
  });
}

export function useChangeTicketStatus() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: { id: string; status: TicketStatus; resolution_summary?: string }) => {
      const data = await invoke({ action: 'change_status', ...payload });
      return data.ticket as Ticket;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket', v.id] });
      qc.invalidateQueries({ queryKey: ['ticket-activity', v.id] });
    },
  });
}

export function useAssignTicket() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: { id: string; assigned_to: string | null }) => {
      const data = await invoke({ action: 'assign', ...payload });
      return data.ticket as Ticket;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket', v.id] });
    },
  });
}

export function useSetTechnicalOwner() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: { id: string; technical_owner_id: string | null }) => {
      const data = await invoke({ action: 'set_technical_owner', ...payload });
      return data.ticket as Ticket;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket', v.id] });
    },
  });
}

export function useTicketComments(ticketId: string | null) {
  const { user } = useAuth();
  const invoke = useInvoke();
  return useQuery({
    queryKey: ['ticket-comments', ticketId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_comments', ticket_id: ticketId });
      return (data.comments || []) as TicketComment[];
    },
    enabled: !!user?.id && !!ticketId,
  });
}

export function useAddTicketComment() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: { ticket_id: string; content: string }) => {
      const data = await invoke({ action: 'add_comment', ...payload });
      return data.comment as TicketComment;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', v.ticket_id] });
      qc.invalidateQueries({ queryKey: ['ticket-activity', v.ticket_id] });
    },
  });
}

export function useRedactComment() {
  const qc = useQueryClient();
  const invoke = useInvoke();
  return useMutation({
    mutationFn: async (payload: { comment_id: string; ticket_id: string; reason?: string }) => {
      await invoke({ action: 'redact_comment', comment_id: payload.comment_id, reason: payload.reason });
      return payload;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ticket-comments', v.ticket_id] });
      qc.invalidateQueries({ queryKey: ['ticket-activity', v.ticket_id] });
    },
  });
}

export function useTicketActivity(ticketId: string | null) {
  const { user } = useAuth();
  const invoke = useInvoke();
  return useQuery({
    queryKey: ['ticket-activity', ticketId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_activity', ticket_id: ticketId });
      return (data.activity || []) as TicketActivity[];
    },
    enabled: !!user?.id && !!ticketId,
  });
}

export function useTicketLinkedTasks(ticketId: string | null) {
  const { user } = useAuth();
  const invoke = useInvoke();
  return useQuery({
    queryKey: ['ticket-linked-tasks', ticketId],
    queryFn: async () => {
      const data = await invoke({ action: 'list_linked_tasks', ticket_id: ticketId });
      return (data.tasks || []) as Array<{ id: string; title: string; status: string; assigned_to: string | null; created_at: string }>;
    },
    enabled: !!user?.id && !!ticketId,
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Types ───

export interface LeadService {
  id: string;
  lead_id: string;
  service_name: string;
  description: string | null;
  start_date: string | null;
  expiry_date: string;
  status: string;
  deleted_at: string | null;
  created_at: string;
}

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type LeadLostReason = 'competitor' | 'price_issue' | 'no_response' | 'timing' | 'budget' | 'invalid' | 'duplicate' | 'deprioritized' | 'other';

export const LEAD_STAGES: { value: LeadStage; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30' },
  { value: 'contacted', label: 'Contacted', color: 'bg-primary/10 text-primary border-primary/30' },
  { value: 'qualified', label: 'Qualified', color: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30' },
  { value: 'proposal', label: 'Proposal', color: 'bg-accent/50 text-accent-foreground border-accent' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40' },
  { value: 'won', label: 'Won', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' },
  { value: 'lost', label: 'Lost', color: 'bg-destructive/10 text-destructive border-destructive/30' },
];

export const LOST_REASONS: { value: LeadLostReason; label: string }[] = [
  { value: 'competitor', label: 'Lost to Competitor' },
  { value: 'price_issue', label: 'Price / Budget Issue' },
  { value: 'no_response', label: 'No Response' },
  { value: 'timing', label: 'Bad Timing' },
  { value: 'budget', label: 'Budget Constraints' },
  { value: 'invalid', label: 'Invalid Lead' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'deprioritized', label: 'Deprioritized' },
  { value: 'other', label: 'Other' },
];

export interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  created_by: string;
  assigned_to: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // New enterprise fields
  stage: LeadStage;
  estimated_value: number | null;
  currency: string;
  probability_percent: number;
  weighted_forecast: number | null;
  expected_close_date: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  industry: string | null;
  website: string | null;
  secondary_phone: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  country_name: string | null;
  state_province: string | null;
  tags: string[];
  lost_reason_code: LeadLostReason | null;
  lost_notes: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  converted_at: string | null;
  converted_to_type: string | null;
  converted_to_id: string | null;
  score: number;
  score_band: 'hot' | 'warm' | 'cold';
  score_updated_at: string | null;
  services?: LeadService[];
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  actor_id: string;
  activity_type: string;
  title: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  author_id: string;
  note_type: string;
  content: string;
  outcome: string | null;
  next_step: string | null;
  contact_date: string | null;
  duration_minutes: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface LeadStats {
  total: number;
  active: number;
  potential: number;
  total_services: number;
  expiring_30: number;
  expiring_7: number;
  lost: number;
  stage_counts: Record<string, number>;
  pipeline_value: number;
  weighted_forecast: number;
  overdue_follow_ups: number;
  qualified: number;
  won: number;
}

// ─── Provisional UI-only lead scoring ───
// WARNING: This is for display purposes only in Phase 1.
// Do NOT use for reporting, automation, or exports.
// Will move to backend/database in a later phase.
export function computeLeadScore(lead: Lead): { score: number; band: 'hot' | 'warm' | 'cold' } {
  let score = 0;
  // Stage progress
  const stageOrder: LeadStage[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won'];
  const stageIdx = stageOrder.indexOf(lead.stage);
  if (stageIdx >= 0) score += stageIdx * 10;
  if (lead.stage === 'won') score += 20;
  // Value presence
  if (lead.estimated_value && lead.estimated_value > 0) score += 15;
  if (lead.estimated_value && lead.estimated_value > 10000) score += 10;
  // Contact completeness
  if (lead.contact_email) score += 5;
  if (lead.contact_phone) score += 5;
  if (lead.website) score += 3;
  if (lead.industry) score += 2;
  // Activity recency
  if (lead.last_contacted_at) {
    const daysSince = (Date.now() - new Date(lead.last_contacted_at).getTime()) / 86400000;
    if (daysSince < 3) score += 15;
    else if (daysSince < 7) score += 10;
    else if (daysSince < 14) score += 5;
  }
  // Services count
  if (lead.services && lead.services.length > 0) score += Math.min(lead.services.length * 3, 15);
  // Probability
  score += Math.floor(lead.probability_percent / 10);

  const band = score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cold';
  return { score: Math.min(100, score), band };
}

// ─── API Helper ───

async function invokeLeads(token: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('leads', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  return data;
}

// ─── Query Hooks ───

export function useLeadsWithServices(statusFilter?: string, stageFilter?: string) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['leads-with-services', user?.id, statusFilter, stageFilter],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeLeads(token, { action: 'list_with_services', status: statusFilter, stage: stageFilter });
      return (data.leads || []) as Lead[];
    },
    enabled: !!user?.id,
  });
}

export function useLeadsList(statusFilter?: string) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['leads', user?.id, statusFilter],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeLeads(token, { action: 'list', status: statusFilter });
      return (data.leads || []) as Lead[];
    },
    enabled: !!user?.id,
  });
}

export function useLeadServices(leadId: string | null) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['lead-services', leadId],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeLeads(token, { action: 'list_services', lead_id: leadId });
      return (data.services || []) as LeadService[];
    },
    enabled: !!user?.id && !!leadId,
  });
}

export function useLeadStats() {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['lead-stats', user?.id],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeLeads(token, { action: 'stats' });
      return data.stats as LeadStats;
    },
    enabled: !!user?.id,
  });
}

export function useLeadActivities(leadId: string | null) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeLeads(token, { action: 'list_activities', lead_id: leadId });
      return (data.activities || []) as LeadActivity[];
    },
    enabled: !!user?.id && !!leadId,
  });
}

export function useLeadNotes(leadId: string | null) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeLeads(token, { action: 'list_notes', lead_id: leadId });
      return (data.notes || []) as LeadNote[];
    },
    enabled: !!user?.id && !!leadId,
  });
}

// ─── Mutation Hooks ───

function invalidateLeadQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['leads'] });
  qc.invalidateQueries({ queryKey: ['leads-with-services'] });
  qc.invalidateQueries({ queryKey: ['lead-stats'] });
}

export function useCreateLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'create', ...lead });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Lead created'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<Lead> & { id: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'update', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Lead updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'delete', id });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Lead deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useChangeStage() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; stage: LeadStage; lost_reason_code?: LeadLostReason; lost_notes?: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'change_stage', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Stage updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAssignOwner() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; assigned_to: string | null }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'assign_owner', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Owner assigned'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useMarkLost() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; lost_reason_code: LeadLostReason; lost_notes?: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'mark_lost', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Lead marked as lost'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReopenLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; stage?: LeadStage }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'reopen', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Lead reopened'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { lead_id: string; note_type?: string; content: string; outcome?: string; next_step?: string; contact_date?: string; duration_minutes?: number }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'add_note', ...payload });
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['lead-notes', v.lead_id] });
      qc.invalidateQueries({ queryKey: ['lead-activities', v.lead_id] });
      invalidateLeadQueries(qc);
      toast.success('Note added');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCheckDuplicates() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { company_name?: string; email?: string; phone?: string; exclude_id?: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'check_duplicates', ...payload });
    },
  });
}

export function useAddService() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { lead_id: string; service_name: string; description?: string; start_date?: string; expiry_date: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'add_service', ...payload });
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['lead-services', v.lead_id] }); invalidateLeadQueries(qc); toast.success('Service added'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; lead_id: string; service_name?: string; description?: string; start_date?: string; expiry_date?: string; status?: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'update_service', ...payload });
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['lead-services', v.lead_id] }); invalidateLeadQueries(qc); toast.success('Service updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; lead_id: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'delete_service', ...payload });
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['lead-services', v.lead_id] }); invalidateLeadQueries(qc); toast.success('Service removed'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Bulk Mutation Hooks ───

export function useBulkChangeStage() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { ids: string[]; stage: LeadStage; lost_reason_code?: string; lost_notes?: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'bulk_change_stage', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkAssignOwner() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { ids: string[]; assigned_to: string | null }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'bulk_assign_owner', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBulkDelete() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { ids: string[] }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'bulk_delete', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Conversion Hooks ───

export function useConvertLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; account_name?: string; contact_first_name?: string; contact_last_name?: string; opportunity_name?: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'convert', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Lead converted successfully'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUnconvertLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string }) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'unconvert', ...payload });
    },
    onSuccess: () => { invalidateLeadQueries(qc); toast.success('Conversion reversed'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

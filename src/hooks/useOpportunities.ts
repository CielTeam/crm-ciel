import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type OpportunityStage = 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost';

export const OPPORTUNITY_STAGES: { value: OpportunityStage; label: string; color: string }[] = [
  { value: 'prospecting', label: 'Prospecting', color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30' },
  { value: 'qualification', label: 'Qualification', color: 'bg-primary/10 text-primary border-primary/30' },
  { value: 'proposal', label: 'Proposal', color: 'bg-accent/50 text-accent-foreground border-accent' },
  { value: 'negotiation', label: 'Negotiation', color: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30' },
  { value: 'won', label: 'Won', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' },
  { value: 'lost', label: 'Lost', color: 'bg-destructive/10 text-destructive border-destructive/30' },
];

export interface Opportunity {
  id: string;
  name: string;
  account_id: string | null;
  contact_id: string | null;
  stage: OpportunityStage;
  estimated_value: number | null;
  currency: string;
  probability_percent: number;
  weighted_forecast: number | null;
  expected_close_date: string | null;
  won_at: string | null;
  notes: string | null;
  owner: string;
  source_lead_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

async function invokeOpps(token: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('opportunities', {
    body, headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const b = await ctx.json(); throw new Error(b?.error || error.message); } catch (e) { if (e instanceof Error) throw e; }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useOpportunities(accountId?: string) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['opportunities', user?.id, accountId],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeOpps(token, { action: 'list', ...(accountId ? { account_id: accountId } : {}) });
      return (data.opportunities || []) as Opportunity[];
    },
    enabled: !!user?.id,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['opportunities'] });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<Opportunity>) => {
      const token = await getToken();
      return invokeOpps(token, { action: 'create_opportunity', ...payload });
    },
    onSuccess: () => { invalidate(qc); toast.success('Opportunity created'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<Opportunity> & { id: string }) => {
      const token = await getToken();
      return invokeOpps(token, { action: 'update_opportunity', ...payload });
    },
    onSuccess: () => { invalidate(qc); toast.success('Opportunity updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useChangeOpportunityStage() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; stage: OpportunityStage }) => {
      const token = await getToken();
      return invokeOpps(token, { action: 'change_stage', ...payload });
    },
    onSuccess: () => { invalidate(qc); toast.success('Stage updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return invokeOpps(token, { action: 'delete_opportunity', id });
    },
    onSuccess: () => { invalidate(qc); toast.success('Opportunity deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

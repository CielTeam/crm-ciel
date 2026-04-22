import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Types ───

export type QuotationStatus =
  | 'requested'
  | 'in_review'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

export const QUOTATION_STATUSES: { value: QuotationStatus; label: string; tone: string }[] = [
  { value: 'requested', label: 'Requested', tone: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30' },
  { value: 'in_review', label: 'In Review', tone: 'bg-primary/10 text-primary border-primary/30' },
  { value: 'sent', label: 'Sent', tone: 'bg-accent/50 text-accent-foreground border-accent' },
  { value: 'accepted', label: 'Accepted', tone: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30' },
  { value: 'rejected', label: 'Rejected', tone: 'bg-destructive/10 text-destructive border-destructive/30' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bg-muted text-muted-foreground border-border' },
];

export const QUOTATION_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR'] as const;

export interface QuotationAccountSummary {
  id: string;
  name: string;
  email?: string | null;
  country_code?: string | null;
}

export interface QuotationRequesterSummary {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface Quotation {
  id: string;
  reference: string | null;
  account_id: string;
  requested_by: string;
  status: QuotationStatus;
  currency: string;
  total_amount: number | null;
  notes: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  account?: QuotationAccountSummary | null;
  requester?: QuotationRequesterSummary | null;
  item_count?: number;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  account_service_id: string | null;
  service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  sort_order: number;
  created_at: string;
}

export interface QuotationActivity {
  id: string;
  quotation_id: string;
  actor_id: string;
  activity_type: string;
  title: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface QuotationDetail {
  quotation: Quotation;
  items: QuotationItem[];
  account: Record<string, unknown> | null;
  requester: QuotationRequesterSummary | null;
  activities: QuotationActivity[];
}

export interface QuotationFilters {
  search?: string;
  status?: QuotationStatus | '';
  account_id?: string;
  requested_by?: string;
  from?: string;
  to?: string;
}

// ─── Helpers ───

async function invokeQuotations(token: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('quotations', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: ['quotations'] });
  if (id) qc.invalidateQueries({ queryKey: ['quotation', id] });
}

// ─── Queries ───

export function useQuotations(filters?: QuotationFilters) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['quotations', filters || {}],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeQuotations(token, { action: 'list', filters: filters || {} });
      return (data.quotations || []) as Quotation[];
    },
    enabled: !!user,
  });
}

export function useQuotation(id: string | null | undefined) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['quotation', id],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeQuotations(token, { action: 'get', id });
      return data as QuotationDetail;
    },
    enabled: !!user && !!id,
  });
}

// ─── Mutations ───

export function useCreateQuotation() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      account_id: string;
      items: Array<{
        account_service_id?: string | null;
        service_name: string;
        description?: string | null;
        quantity?: number;
        unit_price?: number | null;
      }>;
      currency?: string;
      notes?: string | null;
      total_amount?: number | null;
    }) => {
      const token = await getToken();
      const data = await invokeQuotations(token, { action: 'create', ...payload });
      return data.quotation as Quotation;
    },
    onSuccess: () => { invalidateAll(qc); toast.success('Quotation requested'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateQuotation() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; notes?: string | null; currency?: string; total_amount?: number | null }) => {
      const token = await getToken();
      const data = await invokeQuotations(token, { action: 'update', ...payload });
      return data.quotation as Quotation;
    },
    onSuccess: (_d, vars) => { invalidateAll(qc, vars.id); toast.success('Quotation updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateQuotationStatus() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string; status: QuotationStatus }) => {
      const token = await getToken();
      return invokeQuotations(token, { action: 'update_status', ...payload });
    },
    onSuccess: (_d, vars) => { invalidateAll(qc, vars.id); toast.success('Status updated'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteQuotation() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return invokeQuotations(token, { action: 'delete', id });
    },
    onSuccess: () => { invalidateAll(qc); toast.success('Quotation deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddQuotationItem() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      quotation_id: string;
      service_name: string;
      description?: string | null;
      quantity?: number;
      unit_price?: number | null;
      account_service_id?: string | null;
    }) => {
      const token = await getToken();
      const data = await invokeQuotations(token, { action: 'add_item', ...payload });
      return data.item as QuotationItem;
    },
    onSuccess: (_d, vars) => { invalidateAll(qc, vars.quotation_id); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateQuotationItem() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      item_id: string;
      quotation_id: string;
      service_name?: string;
      description?: string | null;
      quantity?: number;
      unit_price?: number | null;
    }) => {
      const token = await getToken();
      const { item_id, quotation_id: _qid, ...rest } = payload;
      const data = await invokeQuotations(token, { action: 'update_item', item_id, ...rest });
      return data.item as QuotationItem;
    },
    onSuccess: (_d, vars) => { invalidateAll(qc, vars.quotation_id); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveQuotationItem() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { item_id: string; quotation_id: string }) => {
      const token = await getToken();
      return invokeQuotations(token, { action: 'remove_item', item_id: payload.item_id });
    },
    onSuccess: (_d, vars) => { invalidateAll(qc, vars.quotation_id); toast.success('Item removed'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useExportQuotationsCsv() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { ids?: string[] }) => {
      const token = await getToken();
      const data = await invokeQuotations(token, { action: 'export_csv', ids: payload.ids });
      return data as { csv: string; count: number };
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Account-side: request quotation passthrough ───

export function useRequestQuotationFromAccount() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      account_id: string;
      account_service_ids?: string[];
      currency?: string;
      notes?: string | null;
      total_amount?: number | null;
    }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('accounts', {
        body: { action: 'request_quotation', ...payload },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.quotation as Quotation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      toast.success('Quotation request sent to accounting');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

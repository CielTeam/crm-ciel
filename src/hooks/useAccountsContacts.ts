import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Account {
  id: string;
  name: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  country_name: string | null;
  state_province: string | null;
  notes: string | null;
  tags: string[];
  owner: string;
  source_lead_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  account_status: string;
  account_type: string;
  account_health: string;
}

export interface AccountNote {
  id: string;
  account_id: string;
  author_id: string;
  note_type: string;
  content: string;
  outcome: string | null;
  next_step: string | null;
  contact_date: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface AccountActivity {
  id: string;
  account_id: string;
  actor_id: string;
  activity_type: string;
  title: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  secondary_phone: string | null;
  job_title: string | null;
  notes: string | null;
  account_id: string | null;
  owner: string;
  source_lead_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AccountWithContacts extends Account {
  contacts: Contact[];
}

export interface AccountListFilters {
  search?: string;
  owner?: string;
  country_code?: string;
  industry?: string;
  status?: string;
  type?: string;
  health?: string;
}

function hasActiveFilters(f?: AccountListFilters): boolean {
  if (!f) return false;
  return Boolean(f.search || f.owner || f.country_code || f.industry || f.status || f.type || f.health);
}

export function useAccounts(filters?: AccountListFilters) {
  const { user, getToken } = useAuth();
  // Always go through the edge function so the Auth0 JWT (sub claim) is forwarded
  // to PostgREST via the service role. Direct supabase.from() calls would lack
  // the x-auth0-sub header and fail RLS (returning empty results).
  return useQuery({
    queryKey: ['accounts', filters || {}],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'list_accounts', filters: filters || {} });
      return (data.accounts ?? []) as Account[];
    },
    enabled: !!user,
  });
}

export function useContacts() {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'list_contacts' });
      return (data.contacts ?? []) as Contact[];
    },
    enabled: !!user,
  });
}

export function useAccountsWithContacts(filters?: AccountListFilters) {
  const { data: accounts, isLoading: accLoading } = useAccounts(filters);
  const { data: contacts, isLoading: conLoading } = useContacts();

  const merged: AccountWithContacts[] = (accounts ?? []).map((a) => ({
    ...a,
    contacts: (contacts ?? []).filter((c) => c.account_id === a.id),
  }));

  return { data: merged, contacts: contacts ?? [], isLoading: accLoading || conLoading };
}

async function invokeAccounts(token: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('accounts', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['accounts'] });
  qc.invalidateQueries({ queryKey: ['contacts'] });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<Omit<Account, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'source_lead_id'>>) => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'create_account', ...payload });
      return data.account as Account;
    },
    onSuccess: () => { invalidateAll(qc); toast.success('Account created'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return invokeAccounts(token, { action: 'delete_account', id });
    },
    onSuccess: () => { invalidateAll(qc); toast.success('Account deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<Omit<Contact, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'source_lead_id'>>) => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'create_contact', ...payload });
      return data.contact as Contact;
    },
    onSuccess: () => { invalidateAll(qc); toast.success('Contact created'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return invokeAccounts(token, { action: 'delete_contact', id });
    },
    onSuccess: () => { invalidateAll(qc); toast.success('Contact deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string } & Partial<Omit<Account, 'id' | 'owner' | 'created_by' | 'created_at' | 'updated_at' | 'source_lead_id'>>) => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'update_account', ...payload });
      return data.account as Account;
    },
    onSuccess: () => { invalidateAll(qc); },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { id: string } & Partial<Omit<Contact, 'id' | 'owner' | 'created_by' | 'created_at' | 'updated_at' | 'source_lead_id'>>) => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'update_contact', ...payload });
      return data.contact as Contact;
    },
    onSuccess: () => { invalidateAll(qc); },
  });
}

// Backfill helper for lead scores (one-shot trigger)
export function useRecomputeAllLeadScores() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('leads', {
        body: { action: 'recompute_score', all: true },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['leads-with-services'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Recomputed ${d?.updated ?? 0} lead scores`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// =================== Account Notes & Activities ===================

export function useAccountNotes(accountId: string | null | undefined) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['account-notes', accountId],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'list_notes', account_id: accountId });
      return (data.notes ?? []) as AccountNote[];
    },
    enabled: !!user && !!accountId,
  });
}

export function useAddAccountNote() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      account_id: string;
      note_type: string;
      content: string;
      outcome?: string;
      next_step?: string;
      contact_date?: string;
      duration_minutes?: number;
    }) => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'add_note', ...payload });
      return data.note as AccountNote;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['account-notes', vars.account_id] });
      qc.invalidateQueries({ queryKey: ['account-activities', vars.account_id] });
      toast.success('Note added');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAccountActivities(accountId: string | null | undefined) {
  const { user, getToken } = useAuth();
  return useQuery({
    queryKey: ['account-activities', accountId],
    queryFn: async () => {
      const token = await getToken();
      const data = await invokeAccounts(token, { action: 'list_activities', account_id: accountId });
      return (data.activities ?? []) as AccountActivity[];
    },
    enabled: !!user && !!accountId,
  });
}

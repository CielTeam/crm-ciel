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

export function useAccounts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Account[];
    },
    enabled: !!user,
  });
}

export function useContacts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
    enabled: !!user,
  });
}

export function useAccountsWithContacts() {
  const { data: accounts, isLoading: accLoading } = useAccounts();
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

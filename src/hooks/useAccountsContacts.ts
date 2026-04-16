import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Account {
  id: string;
  name: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
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

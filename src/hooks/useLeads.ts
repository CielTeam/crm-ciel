import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
}

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

async function invokeLeads(token: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('leads', {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  return data;
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
      return data.stats as { total: number; active: number; expiring_30: number; lost: number };
    },
    enabled: !!user?.id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      const token = await getToken();
      return invokeLeads(token, { action: 'create', ...lead });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['lead-stats'] }); toast.success('Lead created'); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['lead-stats'] }); toast.success('Lead updated'); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['lead-stats'] }); toast.success('Lead deleted'); },
    onError: (e: Error) => toast.error(e.message),
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
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['lead-services', v.lead_id] }); qc.invalidateQueries({ queryKey: ['lead-stats'] }); toast.success('Service added'); },
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
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['lead-services', v.lead_id] }); qc.invalidateQueries({ queryKey: ['lead-stats'] }); toast.success('Service updated'); },
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
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['lead-services', v.lead_id] }); qc.invalidateQueries({ queryKey: ['lead-stats'] }); toast.success('Service removed'); },
    onError: (e: Error) => toast.error(e.message),
  });
}

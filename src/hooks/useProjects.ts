import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'archived';
  color: string | null;
  department: string | null;
  is_personal: boolean;
  target_end_date: string | null;
  owner_user_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectAnalytics {
  total: number;
  open: number;
  in_progress: number;
  done: number;
  overdue: number;
  completion_percent: number;
  remaining_minutes: number;
  days_remaining: number | null;
  on_track: boolean | null;
}

export type ProjectScope = 'mine' | 'department' | 'all';

function useProjectsInvoke() {
  const { getToken } = useAuth();
  return async (body: Record<string, unknown>) => {
    const token = await getToken();
    const { data, error } = await supabase.functions.invoke('projects', {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      const ctxBody = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json;
      const msg = ctxBody ? await ctxBody().catch(() => null) : null;
      throw new Error(msg?.error || error.message || 'Request failed');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

export function useProjects(scope: ProjectScope = 'mine', department?: string) {
  const { user } = useAuth();
  const invoke = useProjectsInvoke();
  return useQuery({
    queryKey: ['projects', scope, department, user?.id],
    queryFn: async () => {
      const data = await invoke({ action: 'list', scope, department });
      return (data.projects || []) as Project[];
    },
    enabled: !!user?.id,
  });
}

export function useProjectAnalytics(projectId: string | null) {
  const { user } = useAuth();
  const invoke = useProjectsInvoke();
  return useQuery({
    queryKey: ['project-analytics', projectId],
    queryFn: async () => {
      const data = await invoke({ action: 'analytics', id: projectId });
      return { project: data.project as Project, analytics: data.analytics as ProjectAnalytics };
    },
    enabled: !!user?.id && !!projectId,
  });
}

export function useProjectsAnalyticsSummary(scope: ProjectScope = 'mine', department?: string) {
  const { user } = useAuth();
  const invoke = useProjectsInvoke();
  return useQuery({
    queryKey: ['projects-analytics-summary', scope, department, user?.id],
    queryFn: async () => {
      const data = await invoke({ action: 'analytics_summary', scope, department });
      return (data.summary || []) as Array<{ project: Project; analytics: ProjectAnalytics }>;
    },
    enabled: !!user?.id,
  });
}

export function useTasksByProject(projectId: string | null) {
  const { user } = useAuth();
  const invoke = useProjectsInvoke();
  return useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: async () => {
      const data = await invoke({ action: 'tasks', project_id: projectId });
      return data.tasks || [];
    },
    enabled: !!user?.id && !!projectId,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const invoke = useProjectsInvoke();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string;
      department?: string | null;
      is_personal?: boolean;
      color?: string | null;
      target_end_date?: string | null;
      shared_departments?: string[];
    }) => {
      const data = await invoke({ action: 'create', ...payload });
      return data.project as Project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects-analytics-summary'] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  const invoke = useProjectsInvoke();
  return useMutation({
    mutationFn: async (payload: { id: string } & Partial<Pick<Project, 'name' | 'description' | 'status' | 'color' | 'target_end_date'>>) => {
      const data = await invoke({ action: 'update', ...payload });
      return data.project as Project;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project-analytics'] });
      qc.invalidateQueries({ queryKey: ['projects-analytics-summary'] });
    },
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  const invoke = useProjectsInvoke();
  return useMutation({
    mutationFn: async (id: string) => invoke({ action: 'archive', id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useReorderProjectTasks() {
  const qc = useQueryClient();
  const invoke = useProjectsInvoke();
  return useMutation({
    mutationFn: async (payload: { project_id: string; task_ids: string[] }) => invoke({ action: 'reorder_tasks', ...payload }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['project-tasks', vars.project_id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useAttachTaskToProject() {
  const qc = useQueryClient();
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (payload: { task_id: string; project_id: string | null; create_personal_project_name?: string }) => {
      const token = await getToken();
      const { data, error } = await supabase.functions.invoke('tasks', {
        body: { action: 'attach_to_project', ...payload },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects-analytics-summary'] });
    },
  });
}

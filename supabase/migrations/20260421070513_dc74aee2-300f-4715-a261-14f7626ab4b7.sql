ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS lead_id uuid;
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id) WHERE lead_id IS NOT NULL;
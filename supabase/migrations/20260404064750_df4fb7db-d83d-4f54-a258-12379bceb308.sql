
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_notes text,
  ADD COLUMN IF NOT EXISTS mark_done_by text,
  ADD COLUMN IF NOT EXISTS mark_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS mark_undone_by text,
  ADD COLUMN IF NOT EXISTS mark_undone_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_pinned_sort ON public.tasks (pinned DESC, sort_order ASC, created_at DESC);

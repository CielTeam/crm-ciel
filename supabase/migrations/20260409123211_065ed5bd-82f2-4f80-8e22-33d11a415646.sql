-- Drop the existing CHECK constraint and recreate with full workflow statuses
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'done', 'pending_accept', 'accepted', 'declined', 'submitted', 'approved', 'rejected'));
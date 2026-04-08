
-- Drop the existing CHECK constraint that only allows todo/in_progress/done
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Recreate with all statuses the system uses
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'done', 'pending_accept', 'approved', 'declined', 'submitted'));

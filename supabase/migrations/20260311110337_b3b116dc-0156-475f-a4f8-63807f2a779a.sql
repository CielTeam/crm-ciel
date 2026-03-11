
CREATE TABLE public.task_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  old_status text,
  new_status text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages task_activity_logs"
  ON public.task_activity_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can read activity for their tasks"
  ON public.task_activity_logs
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_activity_logs.task_id
        AND (
          t.created_by = (current_setting('request.headers'::text, true)::json ->> 'x-auth0-sub')
          OR t.assigned_to = (current_setting('request.headers'::text, true)::json ->> 'x-auth0-sub')
        )
    )
  );

CREATE INDEX idx_task_activity_logs_task_id ON public.task_activity_logs(task_id);

ALTER PUBLICATION supabase_realtime ADD TABLE task_activity_logs;

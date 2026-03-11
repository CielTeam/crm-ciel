
CREATE TABLE public.task_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages task_comments"
  ON public.task_comments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can read comments on their tasks"
  ON public.task_comments
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (
          t.created_by = (current_setting('request.headers'::text, true)::json ->> 'x-auth0-sub')
          OR t.assigned_to = (current_setting('request.headers'::text, true)::json ->> 'x-auth0-sub')
        )
    )
  );

CREATE INDEX idx_task_comments_task_id ON public.task_comments(task_id);

ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;

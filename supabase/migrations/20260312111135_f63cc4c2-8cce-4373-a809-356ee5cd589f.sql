
-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true);

-- RLS for storage.objects: service_role full access (used by edge function)
CREATE POLICY "Service role manages attachments"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'attachments')
  WITH CHECK (bucket_id = 'attachments');

-- Public read access for attachments bucket
CREATE POLICY "Public read access for attachments"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'attachments');

-- Create attachments metadata table
CREATE TABLE public.attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  content_type text NOT NULL,
  storage_path text NOT NULL,
  uploaded_by text NOT NULL,
  entity_type text NOT NULL,  -- 'task', 'comment', 'message'
  entity_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages attachments metadata"
  ON public.attachments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can read attachments"
  ON public.attachments
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

CREATE INDEX idx_attachments_entity ON public.attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_uploaded_by ON public.attachments(uploaded_by);

ALTER PUBLICATION supabase_realtime ADD TABLE attachments;

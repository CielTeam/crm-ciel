CREATE TABLE public.lead_saved_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_saved_views_owner ON public.lead_saved_views(owner_id);
CREATE INDEX idx_lead_saved_views_shared ON public.lead_saved_views(is_shared) WHERE is_shared = true;

ALTER TABLE public.lead_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read own or shared saved views"
ON public.lead_saved_views
FOR SELECT
TO authenticated
USING (
  owner_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text)
  OR is_shared = true
);

CREATE POLICY "Service role manages lead_saved_views"
ON public.lead_saved_views
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_lead_saved_views_updated_at
BEFORE UPDATE ON public.lead_saved_views
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
CREATE TABLE public.account_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  description text,
  start_date date,
  expiry_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  created_by text NOT NULL
);

CREATE INDEX idx_account_services_account_id ON public.account_services(account_id);
CREATE INDEX idx_account_services_expiry_date ON public.account_services(expiry_date);
CREATE INDEX idx_account_services_status ON public.account_services(status);

ALTER TABLE public.account_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated scoped read account_services"
ON public.account_services
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = account_services.account_id
      AND a.deleted_at IS NULL
      AND has_leads_access_scoped(
        ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text),
        a.owner
      )
  )
);

CREATE POLICY "Service role manages account_services"
ON public.account_services
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER update_account_services_updated_at
BEFORE UPDATE ON public.account_services
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create leads table
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'potential',
  source text,
  notes text,
  created_by text NOT NULL,
  assigned_to text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create lead_services table
CREATE TABLE public.lead_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  description text,
  start_date date,
  expiry_date date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_services ENABLE ROW LEVEL SECURITY;

-- RLS policies for leads
CREATE POLICY "Service role manages leads" ON public.leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can read active leads" ON public.leads FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

-- RLS policies for lead_services
CREATE POLICY "Service role manages lead_services" ON public.lead_services FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can read active lead_services" ON public.lead_services FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

-- Indexes
CREATE INDEX idx_leads_status ON public.leads(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_created_by ON public.leads(created_by);
CREATE INDEX idx_lead_services_lead_id ON public.lead_services(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_services_expiry ON public.lead_services(expiry_date) WHERE deleted_at IS NULL AND status = 'active';

-- Updated_at triggers
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

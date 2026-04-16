
-- ══════════════════════════════════════════════
-- Accounts
-- ══════════════════════════════════════════════
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text,
  website text,
  city text,
  country text,
  phone text,
  email text,
  notes text,
  owner text NOT NULL,            -- Auth0 sub
  source_lead_id uuid REFERENCES leads(id),
  tags text[] NOT NULL DEFAULT '{}',
  created_by text NOT NULL,       -- Auth0 sub
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_accounts_owner ON accounts(owner) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_source_lead ON accounts(source_lead_id) WHERE source_lead_id IS NOT NULL;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages accounts" ON accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated scoped read accounts" ON accounts FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND has_leads_access_scoped(
    (current_setting('request.headers',true)::json->>'x-auth0-sub'), owner));

-- ══════════════════════════════════════════════
-- Contacts
-- ══════════════════════════════════════════════
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  secondary_phone text,
  job_title text,
  notes text,
  owner text NOT NULL,            -- Auth0 sub
  source_lead_id uuid REFERENCES leads(id),
  created_by text NOT NULL,       -- Auth0 sub
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_contacts_owner ON contacts(owner) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_account ON contacts(account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_source_lead ON contacts(source_lead_id) WHERE source_lead_id IS NOT NULL;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages contacts" ON contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated scoped read contacts" ON contacts FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND has_leads_access_scoped(
    (current_setting('request.headers',true)::json->>'x-auth0-sub'), owner));

-- ══════════════════════════════════════════════
-- Opportunities
-- ══════════════════════════════════════════════
CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id),
  contact_id uuid REFERENCES contacts(id),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'won',
  estimated_value numeric,
  currency text NOT NULL DEFAULT 'USD',
  probability_percent integer NOT NULL DEFAULT 100 CHECK (probability_percent BETWEEN 0 AND 100),
  weighted_forecast numeric GENERATED ALWAYS AS (COALESCE(estimated_value,0) * probability_percent / 100.0) STORED,
  expected_close_date date,
  won_at timestamptz,
  notes text,
  owner text NOT NULL,            -- Auth0 sub
  source_lead_id uuid REFERENCES leads(id),
  created_by text NOT NULL,       -- Auth0 sub
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_opps_owner ON opportunities(owner) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_account ON opportunities(account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_opps_source_lead ON opportunities(source_lead_id) WHERE source_lead_id IS NOT NULL;

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages opportunities" ON opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated scoped read opportunities" ON opportunities FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND has_leads_access_scoped(
    (current_setting('request.headers',true)::json->>'x-auth0-sub'), owner));

-- ══════════════════════════════════════════════
-- Updated_at triggers
-- ══════════════════════════════════════════════
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON opportunities FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

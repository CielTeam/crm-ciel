
-- 1. Create enums
CREATE TYPE public.lead_stage AS ENUM (
  'new','contacted','qualified','proposal','negotiation','won','lost'
);

CREATE TYPE public.lead_lost_reason AS ENUM (
  'competitor','price_issue','no_response','timing',
  'budget','invalid','duplicate','deprioritized','other'
);

-- 2. ALTER leads table with new columns
ALTER TABLE leads
  ADD COLUMN stage lead_stage NOT NULL DEFAULT 'new',
  ADD COLUMN estimated_value numeric,
  ADD COLUMN currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN probability_percent integer NOT NULL DEFAULT 0
    CHECK (probability_percent BETWEEN 0 AND 100),
  ADD COLUMN weighted_forecast numeric
    GENERATED ALWAYS AS (
      COALESCE(estimated_value, 0) * probability_percent / 100.0
    ) STORED,
  ADD COLUMN expected_close_date date,
  ADD COLUMN next_follow_up_at timestamptz,
  ADD COLUMN last_contacted_at timestamptz,
  ADD COLUMN industry text,
  ADD COLUMN website text,
  ADD COLUMN secondary_phone text,
  ADD COLUMN city text,
  ADD COLUMN country text,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN lost_reason_code lead_lost_reason,
  ADD COLUMN lost_notes text,
  ADD COLUMN assigned_by text,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN normalized_company text GENERATED ALWAYS AS (
    lower(trim(regexp_replace(company_name, '\s+', ' ', 'g')))
  ) STORED,
  ADD COLUMN normalized_email text GENERATED ALWAYS AS (
    lower(trim(COALESCE(contact_email, '')))
  ) STORED,
  ADD COLUMN normalized_phone text GENERATED ALWAYS AS (
    regexp_replace(COALESCE(contact_phone, ''), '[^0-9+]', '', 'g')
  ) STORED,
  ADD COLUMN converted_at timestamptz,
  ADD COLUMN converted_to_type text,
  ADD COLUMN converted_to_id uuid;

-- 3. Indexes on leads
CREATE INDEX idx_leads_stage ON leads(stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_created_at ON leads(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_next_follow_up ON leads(next_follow_up_at) WHERE deleted_at IS NULL AND next_follow_up_at IS NOT NULL;
CREATE INDEX idx_leads_expected_close ON leads(expected_close_date) WHERE deleted_at IS NULL AND expected_close_date IS NOT NULL;
CREATE INDEX idx_leads_norm_email ON leads(normalized_email) WHERE deleted_at IS NULL AND normalized_email != '';
CREATE INDEX idx_leads_norm_phone ON leads(normalized_phone) WHERE deleted_at IS NULL AND normalized_phone != '';
CREATE INDEX idx_leads_norm_company ON leads(normalized_company) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_tags ON leads USING gin(tags) WHERE deleted_at IS NULL;

-- 4. Create lead_activities table
CREATE TABLE lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages lead_activities"
  ON lead_activities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. Create lead_notes table
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  note_type text NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general','call_log','email_log','meeting_log','follow_up')),
  content text NOT NULL,
  outcome text,
  next_step text,
  contact_date timestamptz,
  duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages lead_notes"
  ON lead_notes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 6. Scoped access function
CREATE OR REPLACE FUNCTION public.has_leads_access_scoped(_user_id text, _lead_assigned_to text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = _user_id
        AND role IN ('chairman', 'vice_president')
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = _user_id
        AND role = 'head_of_operations'
        AND (
          _lead_assigned_to IS NULL
          OR _lead_assigned_to = _user_id
          OR _lead_assigned_to IN (
            SELECT tm.user_id FROM team_members tm
            WHERE tm.team_id IN (
              SELECT tm2.team_id FROM team_members tm2 WHERE tm2.user_id = _user_id
            )
          )
        )
    )
$$;

-- 7. Update leads RLS — drop old anon policy, add scoped authenticated-only
DROP POLICY IF EXISTS "Users can read active leads" ON leads;

CREATE POLICY "Authenticated scoped read leads" ON leads
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.has_leads_access_scoped(
      (current_setting('request.headers', true)::json ->> 'x-auth0-sub'),
      assigned_to
    )
  );

-- 8. Update lead_services RLS — drop old anon policy, add scoped authenticated-only
DROP POLICY IF EXISTS "Users can read active lead_services" ON lead_services;

CREATE POLICY "Authenticated scoped read lead_services" ON lead_services
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_services.lead_id
        AND leads.deleted_at IS NULL
        AND public.has_leads_access_scoped(
          (current_setting('request.headers', true)::json ->> 'x-auth0-sub'),
          leads.assigned_to
        )
    )
  );

-- 9. RLS for lead_activities — authenticated only, inherit parent lead access
CREATE POLICY "Authenticated read lead_activities" ON lead_activities
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads
    WHERE leads.id = lead_activities.lead_id
      AND leads.deleted_at IS NULL
      AND public.has_leads_access_scoped(
        (current_setting('request.headers', true)::json ->> 'x-auth0-sub'),
        leads.assigned_to
      )
  ));

-- 10. RLS for lead_notes — authenticated only, inherit parent lead access
CREATE POLICY "Authenticated read lead_notes" ON lead_notes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_notes.lead_id
        AND leads.deleted_at IS NULL
        AND public.has_leads_access_scoped(
          (current_setting('request.headers', true)::json ->> 'x-auth0-sub'),
          leads.assigned_to
        )
    )
  );

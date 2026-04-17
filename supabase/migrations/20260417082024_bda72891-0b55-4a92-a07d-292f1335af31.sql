-- 1. Add lifecycle columns to accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'prospect',
  ADD COLUMN IF NOT EXISTS account_health text NOT NULL DEFAULT 'healthy';

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_status_check,
  DROP CONSTRAINT IF EXISTS accounts_type_check,
  DROP CONSTRAINT IF EXISTS accounts_health_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_status_check CHECK (account_status IN ('active','inactive','pending')),
  ADD CONSTRAINT accounts_type_check   CHECK (account_type   IN ('prospect','customer','partner')),
  ADD CONSTRAINT accounts_health_check CHECK (account_health IN ('healthy','at_risk','critical'));

-- 2. account_notes
CREATE TABLE IF NOT EXISTS public.account_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  note_type text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  outcome text,
  next_step text,
  contact_date timestamptz,
  duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_account_notes_account_id ON public.account_notes(account_id);
CREATE INDEX IF NOT EXISTS idx_account_notes_created_at ON public.account_notes(created_at DESC);

ALTER TABLE public.account_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read account_notes" ON public.account_notes;
CREATE POLICY "Authenticated read account_notes"
ON public.account_notes
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = account_notes.account_id
      AND a.deleted_at IS NULL
      AND public.has_leads_access_scoped(
        ((current_setting('request.headers', true))::json ->> 'x-auth0-sub'),
        a.owner
      )
  )
);

DROP POLICY IF EXISTS "Service role manages account_notes" ON public.account_notes;
CREATE POLICY "Service role manages account_notes"
ON public.account_notes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. account_activities
CREATE TABLE IF NOT EXISTS public.account_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_activities_account_id ON public.account_activities(account_id);
CREATE INDEX IF NOT EXISTS idx_account_activities_created_at ON public.account_activities(created_at DESC);

ALTER TABLE public.account_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read account_activities" ON public.account_activities;
CREATE POLICY "Authenticated read account_activities"
ON public.account_activities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = account_activities.account_id
      AND a.deleted_at IS NULL
      AND public.has_leads_access_scoped(
        ((current_setting('request.headers', true))::json ->> 'x-auth0-sub'),
        a.owner
      )
  )
);

DROP POLICY IF EXISTS "Service role manages account_activities" ON public.account_activities;
CREATE POLICY "Service role manages account_activities"
ON public.account_activities
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
-- =========================================================
-- 1. PROJECT MEMBERS
-- =========================================================
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project ON public.project_members(project_id);
CREATE INDEX idx_project_members_user ON public.project_members(user_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read project_members"
  ON public.project_members FOR SELECT TO authenticated
  USING (
    user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
    OR has_project_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'), project_id)
  );

CREATE POLICY "Service role manages project_members"
  ON public.project_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Update has_project_access to include project_members
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id text, _project_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p RECORD;
  _is_exec boolean;
BEGIN
  SELECT owner_user_id, department, is_personal, deleted_at INTO _p
  FROM projects WHERE id = _project_id;
  IF NOT FOUND OR _p.deleted_at IS NOT NULL THEN RETURN false; END IF;

  IF _p.owner_user_id = _user_id THEN RETURN true; END IF;

  -- Check explicit project membership (works even for personal projects)
  IF EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = _project_id AND pm.user_id = _user_id) THEN
    RETURN true;
  END IF;

  IF _p.is_personal THEN RETURN false; END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('chairman','vice_president','head_of_operations','technical_lead','team_development_lead')
  ) INTO _is_exec;
  IF _is_exec THEN RETURN true; END IF;

  IF _p.department IS NOT NULL AND user_in_department(_user_id, _p.department) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM project_departments pd
    WHERE pd.project_id = _project_id
      AND user_in_department(_user_id, pd.department)
  );
END;
$function$;

-- =========================================================
-- 2. TASK ASSIGNEES (multi-assignee)
-- =========================================================
CREATE TABLE public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  assigned_by text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own task_assignees"
  ON public.task_assignees FOR SELECT TO anon, authenticated
  USING (
    user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
    OR EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_assignees.task_id
        AND (
          t.created_by = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
          OR t.assigned_to = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
        )
    )
  );

CREATE POLICY "Service role manages task_assignees"
  ON public.task_assignees FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Extend the tasks SELECT policy: drop and recreate including the task_assignees branch
DROP POLICY IF EXISTS "Users can read own tasks" ON public.tasks;

CREATE POLICY "Users can read own tasks"
  ON public.tasks FOR SELECT TO anon, authenticated
  USING (
    created_by = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
    OR assigned_to = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
    OR EXISTS (
      SELECT 1 FROM task_assignees ta
      WHERE ta.task_id = tasks.id
        AND ta.user_id = ((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub')
    )
  );

-- =========================================================
-- 3. QUOTATIONS
-- =========================================================

-- Reference sequence per year (simple counter table)
CREATE TABLE public.quotation_counters (
  year int PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0
);

CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  total_amount numeric,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (status IN ('requested','in_review','sent','accepted','rejected','cancelled'))
);

CREATE INDEX idx_quotations_account ON public.quotations(account_id);
CREATE INDEX idx_quotations_requester ON public.quotations(requested_by);
CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotations_created ON public.quotations(created_at DESC);

CREATE TABLE public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  account_service_id uuid REFERENCES public.account_services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  description text,
  quantity int NOT NULL DEFAULT 1,
  unit_price numeric,
  line_total numeric,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotation_items_quotation ON public.quotation_items(quotation_id);

CREATE TABLE public.quotation_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotation_activities_quotation ON public.quotation_activities(quotation_id);

-- Auto-generate Q-YYYY-NNNN reference
CREATE OR REPLACE FUNCTION public.assign_quotation_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year int;
  _next int;
BEGIN
  IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN
    RETURN NEW;
  END IF;
  _year := EXTRACT(year FROM now())::int;
  INSERT INTO quotation_counters(year, last_number)
    VALUES (_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = quotation_counters.last_number + 1
  RETURNING last_number INTO _next;
  NEW.reference := 'Q-' || _year::text || '-' || lpad(_next::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quotations_reference
BEFORE INSERT ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.assign_quotation_reference();

CREATE TRIGGER trg_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Helper: can the current user see quotations?
CREATE OR REPLACE FUNCTION public.can_view_quotation(_user_id text, _quotation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q RECORD;
  _is_priv boolean;
BEGIN
  SELECT requested_by, account_id, deleted_at INTO _q FROM quotations WHERE id = _quotation_id;
  IF NOT FOUND OR _q.deleted_at IS NOT NULL THEN RETURN false; END IF;

  IF _q.requested_by = _user_id THEN RETURN true; END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('head_of_accounting','accounting_employee','chairman','vice_president','head_of_operations','sales_lead')
  ) INTO _is_priv;
  IF _is_priv THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = _q.account_id AND a.owner = _user_id
  );
END;
$$;

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read quotations"
  ON public.quotations FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND can_view_quotation(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'), id)
  );

CREATE POLICY "Service role manages quotations"
  ON public.quotations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read quotation_items"
  ON public.quotation_items FOR SELECT TO authenticated
  USING (
    can_view_quotation(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'), quotation_id)
  );

CREATE POLICY "Service role manages quotation_items"
  ON public.quotation_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read quotation_activities"
  ON public.quotation_activities FOR SELECT TO authenticated
  USING (
    can_view_quotation(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'), quotation_id)
  );

CREATE POLICY "Service role manages quotation_activities"
  ON public.quotation_activities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages quotation_counters"
  ON public.quotation_counters FOR ALL TO service_role
  USING (true) WITH CHECK (true);
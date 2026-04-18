-- =====================================================================
-- Phase A: Tickets domain + Hierarchy + Tasks extension
-- =====================================================================

-- 1. DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  head_user_id text NULL,
  parent_department_id uuid NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON public.departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_head ON public.departments(head_user_id);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages departments" ON public.departments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. PROFILES extension
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_user_id text NULL,
  ADD COLUMN IF NOT EXISTS department_id uuid NULL REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_manager ON public.profiles(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(department_id);

-- 3. TICKETS enums + table
DO $$ BEGIN CREATE TYPE public.ticket_type_enum AS ENUM ('support','incident','service_request','maintenance','deployment','bug_fix','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_status_enum AS ENUM ('open','in_progress','waiting','resolved','closed','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_priority_enum AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_source_enum AS ENUM ('internal','client','email','phone','whatsapp','portal','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NULL,
  ticket_type public.ticket_type_enum NOT NULL DEFAULT 'support',
  status public.ticket_status_enum NOT NULL DEFAULT 'open',
  priority public.ticket_priority_enum NOT NULL DEFAULT 'medium',
  source_channel public.ticket_source_enum NOT NULL DEFAULT 'internal',
  account_id uuid NULL,
  contact_id uuid NULL,
  created_by text NOT NULL,
  assigned_to text NULL,
  technical_owner_id text NULL,
  support_duration_estimate_hours numeric(10,2) NULL,
  support_duration_actual_hours numeric(10,2) NULL,
  resolution_summary text NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_account ON public.tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_tech_owner ON public.tickets(technical_owner_id);
CREATE INDEX IF NOT EXISTS idx_tickets_type_status ON public.tickets(ticket_type, status);
CREATE INDEX IF NOT EXISTS idx_tickets_status_updated ON public.tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- 4. TICKET COMMENTS
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  content text NOT NULL,
  is_redacted boolean NOT NULL DEFAULT false,
  redacted_by text NULL,
  redacted_at timestamptz NULL,
  redaction_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments(ticket_id, created_at);
CREATE TRIGGER trg_ticket_comments_updated_at BEFORE UPDATE ON public.ticket_comments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- 5. TICKET ACTIVITIES
CREATE TABLE IF NOT EXISTS public.ticket_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket ON public.ticket_activities(ticket_id, created_at);
ALTER TABLE public.ticket_activities ENABLE ROW LEVEL SECURITY;

-- 6. TASKS extension
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS account_id uuid NULL,
  ADD COLUMN IF NOT EXISTS ticket_id uuid NULL REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible_scope text NOT NULL DEFAULT 'private';
DO $$ BEGIN ALTER TABLE public.tasks ADD CONSTRAINT tasks_progress_percent_check CHECK (progress_percent >= 0 AND progress_percent <= 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.tasks ADD CONSTRAINT tasks_visible_scope_check CHECK (visible_scope IN ('private','department','management_chain')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_tasks_account ON public.tasks(account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ticket ON public.tasks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON public.tasks(assigned_to, status);

-- 7. RBAC HELPER: get_visible_user_ids (CTEs wrap full queries)
CREATE OR REPLACE FUNCTION public.get_visible_user_ids(_user_id text)
RETURNS TABLE(uid text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_ceo boolean;
  _is_vp boolean;
  _is_head_ops boolean;
  _is_dept_head boolean;
  _user_dept uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'chairman') INTO _is_ceo;
  IF _is_ceo THEN
    RETURN QUERY SELECT p.user_id FROM profiles p WHERE p.deleted_at IS NULL;
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'vice_president') INTO _is_vp;
  IF _is_vp THEN
    RETURN QUERY
      WITH RECURSIVE ops_depts AS (
        SELECT d.id FROM departments d
        WHERE d.head_user_id IN (SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'head_of_operations')
        UNION ALL
        SELECT child.id FROM departments child
        JOIN ops_depts od ON child.parent_department_id = od.id
      )
      SELECT _user_id
      UNION
      SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'head_of_operations'
      UNION
      SELECT p.user_id FROM profiles p
      WHERE p.deleted_at IS NULL AND p.department_id IN (SELECT id FROM ops_depts);
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'head_of_operations') INTO _is_head_ops;
  IF _is_head_ops THEN
    RETURN QUERY
      WITH RECURSIVE ops_depts AS (
        SELECT d.id FROM departments d WHERE d.head_user_id = _user_id
        UNION ALL
        SELECT child.id FROM departments child
        JOIN ops_depts od ON child.parent_department_id = od.id
      )
      SELECT _user_id
      UNION
      SELECT p.user_id FROM profiles p
      WHERE p.deleted_at IS NULL AND p.department_id IN (SELECT id FROM ops_depts);
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('team_development_lead','technical_lead','head_of_accounting','head_of_marketing','sales_lead','hr')
  ) INTO _is_dept_head;
  SELECT department_id INTO _user_dept FROM profiles WHERE user_id = _user_id LIMIT 1;

  IF _is_dept_head THEN
    RETURN QUERY
      SELECT _user_id
      UNION
      SELECT p.user_id FROM profiles p
      WHERE p.deleted_at IS NULL
        AND (p.manager_user_id = _user_id OR (_user_dept IS NOT NULL AND p.department_id = _user_dept));
    RETURN;
  END IF;

  RETURN QUERY
    SELECT _user_id
    UNION
    SELECT p.user_id FROM profiles p
    WHERE p.deleted_at IS NULL AND p.manager_user_id = _user_id;
END;
$$;

-- 8. has_ticket_access
CREATE OR REPLACE FUNCTION public.has_ticket_access(_user_id text, _ticket_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t RECORD;
  _is_admin_or_exec boolean;
BEGIN
  SELECT created_by, assigned_to, technical_owner_id INTO _t FROM tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _t.created_by = _user_id OR _t.assigned_to = _user_id OR _t.technical_owner_id = _user_id THEN
    RETURN true;
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('chairman','vice_president','head_of_operations','technical_lead','team_development_lead')
  ) INTO _is_admin_or_exec;
  IF _is_admin_or_exec THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM get_visible_user_ids(_user_id) v
    WHERE v.uid IN (_t.created_by, COALESCE(_t.assigned_to, ''), COALESCE(_t.technical_owner_id, ''))
  );
END;
$$;

-- 9. has_task_access
CREATE OR REPLACE FUNCTION public.has_task_access(_user_id text, _task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t RECORD;
  _caller_dept uuid;
  _assignee_dept uuid;
  _is_exec boolean;
BEGIN
  SELECT created_by, assigned_to, visible_scope INTO _t FROM tasks WHERE id = _task_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _t.created_by = _user_id OR _t.assigned_to = _user_id THEN RETURN true; END IF;
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('chairman','vice_president','head_of_operations','technical_lead','team_development_lead')
  ) INTO _is_exec;
  IF _t.visible_scope = 'management_chain' AND _is_exec THEN RETURN true; END IF;
  IF _t.visible_scope = 'department' THEN
    SELECT department_id INTO _caller_dept FROM profiles WHERE user_id = _user_id LIMIT 1;
    SELECT department_id INTO _assignee_dept FROM profiles WHERE user_id = COALESCE(_t.assigned_to, _t.created_by) LIMIT 1;
    IF _caller_dept IS NOT NULL AND _caller_dept = _assignee_dept THEN RETURN true; END IF;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM get_visible_user_ids(_user_id) v
    WHERE v.uid IN (_t.created_by, COALESCE(_t.assigned_to, ''))
  );
END;
$$;

-- 10. RLS POLICIES
CREATE POLICY "Authenticated read tickets" ON public.tickets FOR SELECT TO authenticated
  USING (public.has_ticket_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), id));
CREATE POLICY "Service role manages tickets" ON public.tickets FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read ticket_comments" ON public.ticket_comments FOR SELECT TO authenticated
  USING (public.has_ticket_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), ticket_id));
CREATE POLICY "Service role manages ticket_comments" ON public.ticket_comments FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read ticket_activities" ON public.ticket_activities FOR SELECT TO authenticated
  USING (public.has_ticket_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), ticket_id));
CREATE POLICY "Service role manages ticket_activities" ON public.ticket_activities FOR ALL TO service_role USING (true) WITH CHECK (true);
-- 1. Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  color text,
  department text,
  is_personal boolean NOT NULL DEFAULT false,
  target_end_date date,
  owner_user_id text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_projects_owner ON public.projects(owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_department ON public.projects(department) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_status ON public.projects(status) WHERE deleted_at IS NULL;

-- 2. Project departments (cross-department sharing)
CREATE TABLE public.project_departments (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  department text NOT NULL,
  PRIMARY KEY (project_id, department)
);

CREATE INDEX idx_project_departments_dept ON public.project_departments(department);

-- 3. Tasks: add project_id + project_sort_order
ALTER TABLE public.tasks ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN project_sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX idx_tasks_project_sort ON public.tasks(project_id, project_sort_order) WHERE project_id IS NOT NULL;

-- 4. updated_at trigger
CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. Helper: is the user a member of the given department name?
CREATE OR REPLACE FUNCTION public.user_in_department(_user_id text, _dept_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN departments d ON d.id = p.department_id
    WHERE p.user_id = _user_id
      AND p.deleted_at IS NULL
      AND d.name = _dept_name
  );
$$;

-- 6. Helper: can the user see this project?
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id text, _project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p RECORD;
  _is_exec boolean;
BEGIN
  SELECT owner_user_id, department, is_personal, deleted_at INTO _p
  FROM projects WHERE id = _project_id;
  IF NOT FOUND OR _p.deleted_at IS NOT NULL THEN RETURN false; END IF;

  IF _p.owner_user_id = _user_id THEN RETURN true; END IF;
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
$$;

-- 7. RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read projects"
  ON public.projects FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND has_project_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), id));

CREATE POLICY "Service role manages projects"
  ON public.projects FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated read project_departments"
  ON public.project_departments FOR SELECT TO authenticated
  USING (has_project_access(((current_setting('request.headers'::text, true))::json ->> 'x-auth0-sub'::text), project_id));

CREATE POLICY "Service role manages project_departments"
  ON public.project_departments FOR ALL TO service_role
  USING (true) WITH CHECK (true);
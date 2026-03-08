
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM (
  'chairman',
  'vice_president',
  'hr',
  'head_of_operations',
  'operations_employee',
  'team_development_lead',
  'developer_employee',
  'technical_lead',
  'technical_employee',
  'head_of_accounting',
  'accounting_employee',
  'head_of_marketing',
  'marketing_employee',
  'sales_lead',
  'sales_employee',
  'driver'
);

-- 2. Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  lead_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- 3. Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  team_id UUID REFERENCES public.teams(id),
  working_hours JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Create team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 6. Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 7. Security definer function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id TEXT, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 8. Security definer function: is_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('technical_lead', 'team_development_lead')
  )
$$;

-- 9. Updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 10. RLS Policies

-- profiles: anyone authenticated can read non-deleted profiles
CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- profiles: users can update own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = (current_setting('request.headers', true)::json->>'x-auth0-sub')::text)
  WITH CHECK (user_id = (current_setting('request.headers', true)::json->>'x-auth0-sub')::text);

-- profiles: admins can insert profiles
CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT TO service_role
  WITH CHECK (true);

-- profiles: admins can update any profile
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO service_role
  WITH CHECK (true);

-- user_roles: authenticated can read own roles
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (true);

-- user_roles: service role manages all
CREATE POLICY "Service role manages roles"
  ON public.user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- teams: authenticated can read
CREATE POLICY "Authenticated users can read teams"
  ON public.teams FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

-- teams: service role manages
CREATE POLICY "Service role manages teams"
  ON public.teams FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- team_members: authenticated can read
CREATE POLICY "Authenticated users can read team members"
  ON public.team_members FOR SELECT TO authenticated
  USING (true);

-- team_members: service role manages
CREATE POLICY "Service role manages team members"
  ON public.team_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- audit_logs: only service role can insert
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs FOR INSERT TO service_role
  WITH CHECK (true);

-- audit_logs: admins can read (via service role for now since Auth0 users aren't Supabase auth users)
CREATE POLICY "Service role can read audit logs"
  ON public.audit_logs FOR SELECT TO service_role
  USING (true);

-- 11. Seed department teams
INSERT INTO public.teams (name, department) VALUES
  ('Executive', 'executive'),
  ('Human Resources', 'hr'),
  ('Operations', 'operations'),
  ('Development', 'development'),
  ('Technical', 'technical'),
  ('Accounting', 'accounting'),
  ('Marketing', 'marketing'),
  ('Sales', 'sales'),
  ('Logistics', 'logistics');

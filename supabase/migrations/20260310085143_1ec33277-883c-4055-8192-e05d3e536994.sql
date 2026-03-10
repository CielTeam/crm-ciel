
-- Fix profiles SELECT policy: allow anon (Auth0 users) to read profiles
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;
CREATE POLICY "Anyone can read active profiles"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL);

-- Fix user_roles SELECT policy: allow anon to read roles (needed for directory)
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Anyone can read roles"
  ON public.user_roles
  FOR SELECT
  TO anon, authenticated
  USING (true);

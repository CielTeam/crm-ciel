-- Fix teams and team_members SELECT policies to include anon role
DROP POLICY IF EXISTS "Authenticated users can read teams" ON public.teams;
CREATE POLICY "Anyone can read active teams"
  ON public.teams FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Authenticated users can read team members" ON public.team_members;
CREATE POLICY "Anyone can read team members"
  ON public.team_members FOR SELECT TO anon, authenticated
  USING (true);
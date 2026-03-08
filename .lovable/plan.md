

# Phase 1 Database Setup — Complete Supabase Schema + Frontend Wiring

## Current State
- Supabase project connected (ID: `orkbfoviqjijcoqtihuu`), database is empty
- Auth0 is configured with biometric/passkeys, URLs added
- Auth0 credentials not yet provided (will be added later)
- Frontend has Auth0 SDK wired but uses a separate `src/lib/supabase.ts` instead of the connected `src/integrations/supabase/client.ts`

## What Will Be Built

### 1. Database Migration (SQL)
A single migration creating the complete Phase 1 schema:

**Enum:**
- `app_role` — all 16 roles

**Tables:**
- `teams` — id, name, department, lead_user_id (text, Auth0 sub), created_at, deleted_at
- `profiles` — id (uuid), user_id (text, Auth0 sub, unique), email, display_name, avatar_url, phone, team_id (FK teams), working_hours (jsonb), status (active/suspended/deleted), created_at, updated_at, deleted_at
- `user_roles` — id, user_id (text), role (app_role), unique(user_id, role)
- `team_members` — id, team_id (FK teams), user_id (text), joined_at
- `audit_logs` — id, actor_id (text), action (text), target_type (text), target_id (text), metadata (jsonb), ip_address (text), created_at

**Security Functions:**
- `has_role(text, app_role)` — SECURITY DEFINER, checks user_roles without RLS recursion
- `is_admin(text)` — checks technical_lead or team_development_lead

**RLS Policies:**
- `profiles`: authenticated users read all non-deleted profiles; users update own profile only; admins can insert/update all
- `user_roles`: authenticated read own; admins manage all
- `teams`: authenticated read; admins manage
- `team_members`: authenticated read; admins manage
- `audit_logs`: admins read only; no client inserts (service role only via edge function)

**Seed Data:**
- 9 department teams (Executive, HR, Operations, Development, Technical, Accounting, Marketing, Sales, Logistics)

### 2. Edge Function: `audit-log`
A secure edge function for writing audit logs (called server-side with service role key so clients cannot tamper with audit entries). Accepts actor_id, action, target_type, target_id, metadata.

### 3. Edge Function: `sync-profile`
Called after Auth0 login to upsert a profile record if one doesn't exist yet. Uses service role to bypass RLS for the insert. Returns the profile + roles.

### 4. Frontend Updates
- **Remove `src/lib/supabase.ts`** — use `src/integrations/supabase/client.ts` everywhere
- **Update `AuthContext.tsx`** — after Auth0 login, call `sync-profile` edge function to ensure profile exists, then fetch roles. Use the connected Supabase client.
- **Auth0 env vars** — already referenced via `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` in App.tsx; values will be set when you provide them

### 5. Security Approach
- `user_id` columns are `text` (Auth0 `sub` format: `auth0|xxx`) — no FK to `auth.users` since we use Auth0 not Supabase Auth
- Audit logs are insert-only via edge function (service role), never client-writable
- All tables have RLS enabled; policies use `has_role()` to avoid recursion
- Soft delete pattern on profiles and teams (`deleted_at` column)


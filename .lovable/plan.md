

# Fix: Duplicate Emails, Missing Users in Admin, and Auth0 Redirect Error

## Issue 1: Duplicate emails allowed

The `profiles` table has no unique constraint on the `email` column. The edge function also doesn't check for existing emails before inserting.

**Fix:**
- Add a database migration with a unique constraint on `profiles.email`
- Add a duplicate-email check in the `admin-manage-user` edge function's `create_user` action before inserting

```sql
ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
```

In the edge function, before inserting, query for existing profile with same email and return an error if found.

## Issue 2: Created users not showing in admin

The app uses Auth0 (not Supabase Auth). Frontend queries to Supabase use the **anon key**, which has the `anon` role. However, the RLS policies on `profiles`, `user_roles`, and `teams` are all **restrictive** policies targeting the `authenticated` role. Since there's no Supabase-authenticated user, these queries likely return empty results or fail silently.

**Fix:** Change the RLS SELECT policies to also allow the `anon` role, OR (better) pass the Auth0 token context through to Supabase. The simplest fix given the current architecture is to make the SELECT policies permissive (not restrictive) so the anon role can read the data. Alternatively, create an edge function that uses the service role to fetch admin data, bypassing RLS.

Recommended approach: **Create an `admin-list-users` edge function** that uses the service role client to fetch profiles, roles, and teams. This is more secure than loosening RLS policies. Update `useAdminUsers` and `useAdminTeams` to call this edge function instead of querying Supabase tables directly.

## Issue 3: Auth0 infinite reload on published URL

The error is: `invalid_request: The specified redirect_uri 'https://crm-ciel.lovable.app/login' does not have a registered origin.`

This means `https://crm-ciel.lovable.app` is missing from **Allowed Web Origins** in the Auth0 Dashboard. The screenshots shown earlier had the Callback URLs and Logout URLs set, but "Allowed Web Origins" must also include `https://crm-ciel.lovable.app`.

**Fix:** This is a manual Auth0 Dashboard configuration step — no code change needed. The user must add `https://crm-ciel.lovable.app` to **Allowed Web Origins** in the Auth0 application settings.

Additionally, add error handling in `AuthContext.tsx` to catch Auth0 errors and prevent infinite reload loops — if Auth0 returns an error, display it on the login page instead of retrying.

---

### Summary of changes

| File | Change |
|------|--------|
| **Migration SQL** | Add `UNIQUE` constraint on `profiles.email` |
| **`supabase/functions/admin-manage-user/index.ts`** | Add email-exists check before `create_user` insert |
| **`src/hooks/useAdminData.ts`** | Change `useAdminUsers`/`useAdminTeams` to call a new edge function instead of direct table queries |
| **New: `supabase/functions/admin-list-data/index.ts`** | Edge function using service role to fetch all profiles, roles, teams for admin view |
| **`src/contexts/AuthContext.tsx`** | Add Auth0 error handling to prevent infinite reload |
| **Auth0 Dashboard (manual)** | Add `https://crm-ciel.lovable.app` to Allowed Web Origins |


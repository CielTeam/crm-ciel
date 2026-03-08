

# Fix: Slow Login-to-Dashboard Transition

## Problem

Both `LoginPage` and `ProtectedRoute` block rendering on `isLoading`, which includes `syncLoading` (the profile sync call). The `sync-profile` edge function takes several seconds, so users stare at a spinner the entire time instead of seeing the dashboard.

**Flow today:**
1. Auth0 authenticates → `auth0IsAuth = true`
2. `syncProfile` starts → `syncLoading = true` → `isLoading = true`
3. LoginPage shows spinner (line 74-80) instead of redirecting
4. ProtectedRoute shows spinner (line 14-23) instead of rendering dashboard
5. sync-profile finishes (seconds later) → dashboard finally appears

## Fix

**1. `LoginPage.tsx`** — Redirect as soon as `auth0IsAuth` is true, don't wait for sync:
- Move the `isAuthenticated` redirect check **before** the `isLoading` check (swap lines 74-84)
- This way, once Auth0 confirms the user is logged in, they immediately navigate to `/dashboard`

**2. `ProtectedRoute.tsx`** — Only block on `auth0Loading`, not `syncLoading`:
- Change the loading check: if `isAuthenticated` is true, render children immediately even if sync is still loading
- Only show the spinner when `auth0Loading` is true (i.e., Auth0 SDK hasn't initialized yet)
- This lets the dashboard render with whatever profile data is available, and it fills in once sync completes

**3. `AuthContext.tsx`** — Expose `auth0Loading` separately so ProtectedRoute can distinguish:
- Add a new `isInitializing` field (maps to `auth0Loading` only) for use by ProtectedRoute
- Keep `isLoading` as-is for components that want to show loading states for profile data

### Files to modify:
1. `src/contexts/AuthContext.tsx` — Add `isInitializing` field
2. `src/components/auth/ProtectedRoute.tsx` — Use `isInitializing` instead of `isLoading`
3. `src/pages/LoginPage.tsx` — Check `isAuthenticated` before `isLoading`


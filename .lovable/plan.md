

# Fix: Infinite Loading on Dashboard + Add Login Rate Limiting

## Issue 1: Infinite Loading on `/dashboard`

The screenshot shows `crm-ciel.lovable.app/dashboard` stuck on "Loading..." forever. The root cause is that the `syncProfile` function either fails silently or hangs when calling the `sync-profile` edge function. When this happens, `syncLoading` stays `true` indefinitely, which keeps `isLoading` true in `ProtectedRoute`, showing the spinner forever.

**Fix:** Add a timeout and better error recovery to `syncProfile` in `AuthContext.tsx`:
- Add a 10-second timeout on the `sync-profile` call using `AbortController`
- If the call fails or times out, still set `isAuthenticated` to `true` with basic profile data from Auth0 (graceful degradation)
- Also: the published URL `crm-ciel.lovable.app` must be added to Auth0's Allowed Callback URLs, Logout URLs, and Web Origins (manual step)

**Additional fix:** The `isAuthenticated` check (`auth0IsAuth && !isLoading`) means during sync, users see the loading spinner. Change this so `isAuthenticated` is based solely on `auth0IsAuth`, and `isLoading` only gates the profile/role data availability. This prevents the infinite spinner if sync fails.

## Issue 2: Login Rate Limiting (3 attempts, 5-minute cooldown)

Add client-side rate limiting to the email verification step on the login page.

**Implementation in `LoginPage.tsx`:**
- Track failed attempts in component state (persisted to `localStorage` for cross-refresh persistence)
- Store `{ count: number, lockedUntil: number | null }` under a `login_rate_limit` key
- After 3 failed email verifications, set `lockedUntil = Date.now() + 5 * 60 * 1000`
- During cooldown: disable the form, show a countdown timer ("Too many attempts. Try again in X:XX")
- Reset counter on successful verification

### Files to modify:
1. **`src/contexts/AuthContext.tsx`** — Fix `isAuthenticated` logic, add timeout to syncProfile
2. **`src/pages/LoginPage.tsx`** — Add rate limiting with localStorage persistence and countdown UI


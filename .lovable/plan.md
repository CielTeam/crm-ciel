

# Fix: Auth0 Redirect Loop After Email Verification

## Root Cause Analysis

The issue is a redirect loop: Auth0 redirects back to the app, but the user isn't authenticated, so they land back on `/login`. There are two likely causes that need to be addressed:

### Cause 1: Auth0 Allowed URLs Not Configured
The Auth0 application must have the Lovable preview URL in its **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**. Without this, Auth0 will either show an error or silently fail.

**Required URL:** `https://id-preview--58155a04-f321-46bc-b4fc-2e61128e449b.lovable.app`

This is a manual step in the Auth0 Dashboard under Applications → Your App → Settings.

### Cause 2: User Not Registered in Auth0
The user `boutros.georges513@gmail.com` exists in the Supabase `profiles` table but may not exist as an Auth0 user with a passkey registered. Auth0 and Supabase are separate identity systems — adding someone to Supabase does not create them in Auth0. If Auth0 has no account for this email, `loginWithRedirect` will show the Auth0 login/signup page, and if the user can't authenticate there, it redirects back unauthenticated.

### Cause 3: Auth0 Callback Processing
After Auth0 redirects back with `code` and `state` query parameters, the Auth0 SDK needs to process them. Currently `redirect_uri` is set to `window.location.origin`, which lands on `/`. The React router then redirects `/` → `/dashboard` → `ProtectedRoute` → `/login` before the Auth0 SDK finishes processing the callback tokens. This race condition can cause the redirect loop.

## Plan

### 1. Fix redirect_uri to avoid route interference
Change `redirect_uri` from `window.location.origin` to `window.location.origin + '/login'` so Auth0 redirects back to the login page where the Auth0 SDK can process the callback before any route guards interfere.

In `src/App.tsx`:
```typescript
authorizationParams={{
  redirect_uri: window.location.origin + '/login',
}}
```

### 2. Add console logging for debugging
Add temporary `console.log` statements in `AuthContext.tsx` to capture Auth0 state transitions (auth0Loading, auth0IsAuth, auth0User) so we can see exactly what's happening after the redirect.

### 3. User action required
The user needs to verify in the Auth0 Dashboard:
- **Allowed Callback URLs** includes `https://id-preview--58155a04-f321-46bc-b4fc-2e61128e449b.lovable.app/login`
- **Allowed Logout URLs** includes `https://id-preview--58155a04-f321-46bc-b4fc-2e61128e449b.lovable.app`
- **Allowed Web Origins** includes `https://id-preview--58155a04-f321-46bc-b4fc-2e61128e449b.lovable.app`
- The user `boutros.georges513@gmail.com` exists in Auth0 (check Users section) and has a passkey enrolled


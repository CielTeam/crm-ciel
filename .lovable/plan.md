

# Wire Auth0 Credentials

## What we know
- **Domain:** `dev-41gbi4x6z4lm2ifk.us.auth0.com`
- **Client ID:** `2VFDihK6JnYcOruVDqV8zJpclo6ilzo0`
- **Audience:** Not yet determined

## Clarification needed
The "Audience" is the **API Identifier** from Auth0 Dashboard → Applications → APIs. If the user hasn't created an API entry, we can either:
1. Skip the audience parameter (works for basic login without API token validation)
2. Have them create an API in Auth0 first

## Plan
Once clarified, update two files:

1. **`.env`** — Set `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` (and `VITE_AUTH0_AUDIENCE` if applicable)
2. **`src/App.tsx`** — The Auth0Provider already reads from these env vars, no structural changes needed

If no audience is needed, remove the `audience` field from the `authorizationParams` in `App.tsx` to avoid Auth0 rejecting the login.


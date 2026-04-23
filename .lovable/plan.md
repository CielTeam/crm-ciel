

# Fix: Settings save returns 401 Unauthorized

## Root cause

The `sync-profile` edge function verifies the **Auth0** JWT (`verifyAuth0Jwt`). When `SettingsPage` calls `supabase.functions.invoke('sync-profile', ...)`, the Supabase client only attaches its own anon key as `Authorization`, not the Auth0 access token. The function rejects with 401, surfaced as "Edge Function returned a non-2xx status code".

`AuthContext.syncProfile` doesn't hit this bug because it explicitly fetches the Auth0 token via `getAccessTokenSilently({ audience: AUTH0_AUDIENCE })` and passes it in `headers`. The three new calls in `SettingsPage` (save name, upload avatar, remove avatar) skip that step.

## Fix

**`src/pages/SettingsPage.tsx`** — pull `getToken` from `useAuth()` and attach it to all three `sync-profile` invocations:

- `handleSaveName`
- `handleUploadAvatar`
- `handleRemoveAvatar`

Each call becomes:
```ts
const token = await getToken();
const { error } = await supabase.functions.invoke('sync-profile', {
  body: { ... },
  headers: { Authorization: `Bearer ${token}` },
});
```

Wrap the `getToken()` call inside the existing try/catch so token-fetch failures surface as a clean toast instead of an unhandled rejection.

No backend, edge function, or AuthContext changes — `getToken` is already exposed by `useAuth()` and the edge function is already correctly verifying Auth0 JWTs (login-time sync proves it works).

## File impact

```text
edit  src/pages/SettingsPage.tsx   attach Auth0 Bearer token to all 3 sync-profile invocations
```


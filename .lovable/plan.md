

# Zero-Trust Architecture Upgrade

## Summary

Replace all frontend-trusted `actor_id` with Auth0 JWT-verified identity across 9 edge functions, make attachments private with signed URLs, and update all frontend hooks to pass Bearer tokens.

## Prerequisites — Secrets

Two new Supabase secrets must be added before deployment:

| Secret | Value |
|--------|-------|
| `AUTH0_DOMAIN` | `dev-41gbi4x6z4lm2ifk.us.auth0.com` |
| `AUTH0_AUDIENCE` | `CIEL Internal CRM API` |

## Part 1 — Frontend Changes

### `src/App.tsx`
Add `audience` to Auth0Provider's `authorizationParams`:
```typescript
authorizationParams={{
  redirect_uri: window.location.origin + '/login',
  audience: 'CIEL Internal CRM API',
}}
```

### `src/contexts/AuthContext.tsx`
Expose `getToken` from Auth0's `getAccessTokenSilently`:
- Add `getToken: () => Promise<string>` to the `AuthState` interface
- Wrap `getAccessTokenSilently` in a memoized callback
- Provide it in the context value

### All Frontend Hooks (7 files)
`useMessages.ts`, `useAttachments.ts`, `useTasks.ts`, `useLeaves.ts`, `useNotifications.ts`, `useAdminData.ts`, `useDashboardStats.ts`

Pattern applied to every `supabase.functions.invoke` call:
1. Get `getToken` from `useAuth()`
2. Before each invoke, call `const token = await getToken()`
3. Pass `headers: { Authorization: \`Bearer \${token}\` }` in invoke options
4. Remove `actor_id` from the request body entirely

## Part 2 — JWT Verification Helper (Edge Functions)

Each of the 9 edge functions gets an identical `verifyAuth0Jwt` helper (~50 lines) at the top of the file. Since Deno edge functions cannot share imports across function directories, the helper is inlined.

**Logic:**
1. Extract `Authorization: Bearer <token>` from request headers → 401 if missing
2. Decode JWT header to get `kid`
3. Fetch JWKS from `https://${AUTH0_DOMAIN}/.well-known/jwks.json`
4. Find matching key by `kid`, import as CryptoKey
5. Verify JWT signature using `crypto.subtle.verify` with RS256
6. Validate claims: `iss` matches `https://${AUTH0_DOMAIN}/`, `aud` matches `AUTH0_AUDIENCE`, `exp` > now
7. Return `sub` claim as the trusted `actorId`
8. All types are explicit interfaces — no `any` usage

**Return type:** `Promise<string>` (the verified `sub` / user ID)

## Part 3 — Edge Function Upgrades (per function)

### `messages/index.ts`
- Extract `actorId` from JWT (replaces `actor_id` from body)
- **Per-action membership checks:**
  - `list_conversations`: query `conversation_members` by `actorId` (already does this)
  - `get_messages`: verify membership before returning messages (already does this)
  - `send_message`: verify membership + set `sender_id` from `actorId` (already does membership, now also enforces sender)
  - `mark_read`: verify membership before updating `last_read_at` (add explicit check)
  - `create_conversation`: `actorId` is always added to member list as `created_by`

### `attachments/index.ts`
- Extract `actorId` from JWT
- **Per-action access checks:**
  - `upload`: existing entity permission checks remain, but use `actorId`
  - `list`: add access validation — for `task` entities verify creator/assignee, for `message` entities verify conversation membership, for `comment` entities verify task access
  - `delete`: verify `uploaded_by === actorId` (already exists)
- **Signed URLs**: Replace `getPublicUrl()` with `createSignedUrl(storagePath, 3600)` (60 min expiry)

### `tasks/index.ts`
- Extract `actorId` from JWT
- Replace all `actor_id` references with `actorId`
- All existing permission checks (creator/assignee/lead role) remain but use JWT identity

### `leaves/index.ts`
- Extract `actorId` from JWT
- `balances`, `list`, `create`, `cancel`: scope to `actorId`
- `review`: verify reviewer role from database before allowing action (already does this)

### `notifications/index.ts`
- Extract `actorId` from JWT
- All queries already scope by `user_id` — replace with `actorId`

### `dashboard-stats/index.ts`
- Extract `actorId` from JWT
- Replace `actor_id` with `actorId` throughout

### `admin-list-data/index.ts`
- Extract `actorId` from JWT
- Verify admin role from database using `is_admin(actorId)` RPC (already does this, now with JWT identity)

### `admin-manage-user/index.ts`
- Extract `actorId` from JWT (replace the current `getUser()` approach which uses Supabase auth, not Auth0)
- Verify admin role from database using `is_admin(actorId)` RPC
- All audit logs use JWT-derived `actorId`

### `audit-log/index.ts`
- Extract `actorId` from JWT
- Use `actorId` as the audit actor (ignore body `actor_id`)

## Part 4 — Excluded Functions

- **`verify-email/index.ts`**: Pre-login public endpoint. No JWT. Keeps current behavior — returns only `{ exists: boolean }`, no data leakage.
- **`sync-profile/index.ts`**: Called during login flow before a valid API token exists. Keeps current Authorization header check. The `user_id` from Auth0's `sub` is passed from the frontend's Auth0 SDK directly — this is acceptable because sync-profile only upserts for the provided ID and cannot escalate access.

## Part 5 — Storage Migration

**SQL Migration:**
```sql
UPDATE storage.buckets SET public = false WHERE id = 'attachments';
```

This makes the `attachments` bucket private. All file access goes through signed URLs generated by the `attachments` edge function.

## Part 6 — Error Handling

All edge functions follow this pattern:
- `401` — missing or invalid JWT
- `403` — authenticated but unauthorized (not a member, not admin, not owner)
- `400` — bad request (missing fields, invalid action)
- `500` — generic "Internal server error" (no stack traces or internal details leaked)

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Add `audience` to Auth0Provider |
| `src/contexts/AuthContext.tsx` | Expose `getToken` |
| `src/hooks/useMessages.ts` | Pass Bearer token, remove actor_id |
| `src/hooks/useAttachments.ts` | Pass Bearer token, remove actor_id |
| `src/hooks/useTasks.ts` | Pass Bearer token, remove actor_id |
| `src/hooks/useLeaves.ts` | Pass Bearer token, remove actor_id |
| `src/hooks/useNotifications.ts` | Pass Bearer token, remove actor_id |
| `src/hooks/useAdminData.ts` | Pass Bearer token, remove actor_id |
| `src/hooks/useDashboardStats.ts` | Pass Bearer token, remove actor_id |
| `supabase/functions/messages/index.ts` | JWT verification + membership checks |
| `supabase/functions/attachments/index.ts` | JWT verification + signed URLs + access checks |
| `supabase/functions/tasks/index.ts` | JWT verification |
| `supabase/functions/leaves/index.ts` | JWT verification |
| `supabase/functions/notifications/index.ts` | JWT verification |
| `supabase/functions/dashboard-stats/index.ts` | JWT verification |
| `supabase/functions/admin-list-data/index.ts` | JWT verification + admin DB check |
| `supabase/functions/admin-manage-user/index.ts` | JWT verification + admin DB check |
| `supabase/functions/audit-log/index.ts` | JWT verification |

**1 SQL migration**: Make `attachments` bucket private.

**2 new Supabase secrets**: `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`.


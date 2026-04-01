

# Fix Unauthorized Errors + System Hardening

## Part 0 — Fix Unauthorized Errors

**Root cause**: `getAccessTokenSilently()` in `AuthContext.tsx` is called without explicit `audience` parameter. While `audience` is set on `Auth0Provider`, Auth0 may return an opaque token if the API is not correctly configured or if the SDK doesn't propagate the audience. Fix: pass `audience` explicitly.

Additionally, `sync-profile` is called during login without a Bearer token — it checks for an `Authorization` header but the frontend never sends one (it uses `supabase.functions.invoke` without a token). This causes a 401 on first login.

### Changes

**`src/contexts/AuthContext.tsx`**
- Pass `audience` to `getAccessTokenSilently`:
```typescript
const getToken = useCallback(async (): Promise<string> => {
  return getAccessTokenSilently({
    authorizationParams: { audience: 'https://crm-ciel.lovable.app/api' },
  });
}, [getAccessTokenSilently]);
```
- In `syncProfile`, get a token first and pass it to `sync-profile`:
```typescript
const token = await getAccessTokenSilently({
  authorizationParams: { audience: 'https://crm-ciel.lovable.app/api' },
});
// Pass headers: { Authorization: `Bearer ${token}` } to invoke
```

**`supabase/functions/sync-profile/index.ts`**
- Add Auth0 JWT verification (same helper as other functions) so it trusts the `sub` claim instead of the body's `user_id`
- Fall back: extract `user_id` from JWT `sub`, ignore body `user_id`

---

## Part 1 — Rate Limiting (Edge Functions)

Add an in-memory rate limiter to each edge function using a `Map<string, { count, windowStart }>` pattern. Limits:

| Function | Limit | Window |
|----------|-------|--------|
| messages (send_message) | 10 requests | 10 seconds |
| attachments (upload) | 5 requests | 60 seconds |
| verify-email | 3 requests per email | 5 minutes |
| All others | 30 requests | 60 seconds |

Returns `429 Too Many Requests` when exceeded.

**Implementation**: A reusable `checkRateLimit(key, maxRequests, windowMs)` function inlined at the top of each edge function. Uses a `Map` with automatic cleanup of expired entries.

---

## Part 2 — Audit Logging

Most functions already log to `audit_logs`. Add missing audit entries:

| Function | Action | Currently Logged? |
|----------|--------|-------------------|
| messages/send_message | `message.send` | No — add |
| attachments/upload | `attachment.upload` | No — add |
| attachments/delete | `attachment.delete` | No — add |
| tasks/create | `task.create` | No (only activity log) — add audit_logs |
| tasks/update | `task.update` | No — add |
| tasks/delete | `task.delete` | No — add |
| All JWT failures | `auth.failure` | No — add to all 9 functions |

Each entry: `{ actor_id, action, target_type, target_id, metadata, ip_address }`.
For auth failures, `actor_id` is `'anonymous'` and metadata includes the error reason.

---

## Part 3 — Input Sanitization

Add to all edge functions that accept user text input:

- **Strip HTML tags**: `content.replace(/<[^>]*>/g, '')`
- **Trim whitespace**: `.trim()`
- **Max length enforcement**:
  - Message content: 5000 chars (already done in messages)
  - Task title: 255 chars
  - Task description: 5000 chars
  - Comment content: 2000 chars
  - Leave reason: 1000 chars
  - Conversation name: 100 chars
  - Team name: 100 chars
  - Display name: 100 chars
- **Validate required fields**: Already done in most places, ensure consistency

---

## Part 4 — File Validation

The attachments function already validates:
- Extensions: `.zip`, `.rar` only
- Size: 10MB max
- MIME types: limited set

Per the user request, update to:
- **Allowed MIME types**: images (`image/jpeg`, `image/png`, `image/gif`, `image/webp`) and PDF (`application/pdf`) — replacing zip/rar
- **Max size**: 5MB (down from 10MB)
- **File name sanitization**: Already done (`replace(/[^a-zA-Z0-9._-]/g, '_')`)
- **Reject files that don't match**: Already returns 400

---

## Files Modified

| File | Changes |
|------|---------|
| `src/contexts/AuthContext.tsx` | Pass audience to getAccessTokenSilently, send token to sync-profile |
| `supabase/functions/sync-profile/index.ts` | Add JWT verification, extract user_id from sub |
| `supabase/functions/messages/index.ts` | Rate limiting, audit logging, input sanitization |
| `supabase/functions/attachments/index.ts` | Rate limiting, audit logging, MIME type update to images+PDF, 5MB limit |
| `supabase/functions/tasks/index.ts` | Rate limiting, audit logging, input sanitization |
| `supabase/functions/leaves/index.ts` | Rate limiting, audit logging, input sanitization |
| `supabase/functions/notifications/index.ts` | Rate limiting, auth failure logging |
| `supabase/functions/dashboard-stats/index.ts` | Rate limiting, auth failure logging |
| `supabase/functions/admin-list-data/index.ts` | Rate limiting, auth failure logging |
| `supabase/functions/admin-manage-user/index.ts` | Rate limiting, audit logging, input sanitization |
| `supabase/functions/audit-log/index.ts` | Rate limiting, input sanitization |
| `supabase/functions/verify-email/index.ts` | Server-side rate limiting by email |


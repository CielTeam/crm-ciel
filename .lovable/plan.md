

# Fix: avatar upload "Invalid key" + display name reverting to email

## Bug 1 — Avatar upload returns "Invalid key: auth0|69daaf43…"

**Root cause:** Supabase Storage rejects object keys that contain `|`. Auth0 user_ids look like `auth0|69daaf43…`, and we use the raw user_id as the folder name (`${user_id}/${...}`), so the upload is refused.

**Fix in `supabase/functions/sync-profile/index.ts`** (`upload_avatar` action):
- Build a safe folder segment: `const safeUserId = user_id.replace(/[|]/g, '_');`
- Use it for the storage path **and** for the `list` / `remove` cleanup calls so we still find/delete previous avatars.
- Keep the DB row keyed on the real `user_id` — only the storage path is sanitized.

## Bug 2 — Display name reverts to the email after save / refresh / re-login

**Root cause:** Two places overwrite the user's edited `display_name` with whatever Auth0 sends (which is `vp@gmail.com` because that user has no Auth0 `name` claim, so the frontend falls back to the email):

1. `AuthContext.useEffect` calls `syncProfile(email, name, avatar)` on every mount.
2. `refreshProfile()` (called after Save in Settings) also calls `syncProfile(...)` with the same fallback name.

Both hit the default branch in `sync-profile` which **unconditionally** does `update({ display_name: cleanDisplayName, avatar_url: cleanAvatarUrl, ... })` — wiping the user's saved value.

**Fix — server side (`supabase/functions/sync-profile/index.ts`, default sync branch only):**
- For the **existing-profile UPDATE** path: stop overwriting `display_name` and `avatar_url`. Only update `email`, `status`, `updated_at`. The user's edited values in Settings become the source of truth once they exist.
- Keep current behavior for the two **first-time** paths (creating a new profile, or linking a `pending|...` profile) — there `display_name` / `avatar_url` from Auth0 are still useful seeds.

**Fix — client side (`src/contexts/AuthContext.tsx`):**
- Change `refreshProfile()` so it does **not** call `syncProfile()` (which is for login-time seeding). Instead, fetch the latest profile + roles directly from the `profiles` / `user_roles` tables for the current `user_id` and update local state. This guarantees that right after the user clicks Save, the UI shows the value they just saved (not the Auth0 fallback) and never re-triggers a destructive sync.
- Use the same supabase client; `profiles` and `user_roles` already permit anon SELECT per project rules.

## Why this combo is safe

- New users / pending-account claims still get their Auth0 name + picture seeded into `profiles` on first login (unchanged).
- Returning users see their edited Settings values preserved across refresh, navigation, and re-login.
- `refreshProfile()` becomes a pure read — no risk of clobbering anything.
- The avatar upload path becomes valid for every Auth0-issued user_id.

## File impact

```text
edit  supabase/functions/sync-profile/index.ts   sanitize user_id for storage path; stop overwriting display_name/avatar_url on existing-profile sync
edit  src/contexts/AuthContext.tsx               refreshProfile() reads from profiles/user_roles instead of re-running login sync
```

No DB migration. No new files. No changes to SettingsPage (its current calls work once the server stops overwriting).


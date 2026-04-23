

# Two small additions: page refresh button + editable profile (name & avatar)

## 1. Refresh button on every page (in the TopBar)

Adding it to the **TopBar** covers every authenticated page in one place, instead of adding a button to each of the ~15 pages.

**`src/components/layout/TopBar.tsx`** — add a `RefreshCw` icon button next to the Bell:
- On click, call `queryClient.invalidateQueries()` to refetch every active React Query (dashboard stats, tasks, leads, quotations, etc.) for the current page.
- Spin the icon while any query is fetching (`useIsFetching()` from `@tanstack/react-query`) so the user gets visual feedback.
- Tooltip: "Refresh page data".

This means every dashboard and every page (Tasks, Leads, Quotations, Calendar, Directory, Accounts, Tickets, Leaves, Messages, Notifications, Admin, Settings) gets a working refresh with no per-page changes.

## 2. Editable profile in Settings — display name + avatar upload

### Backend

**Storage bucket**: create a new **public** bucket `avatars` (public so the avatar URL works in `<img>` everywhere — sidebar, topbar, directory cards — without signed URL juggling). RLS on `storage.objects` for the `avatars` bucket:
- `SELECT`: anyone (public bucket).
- `INSERT` / `UPDATE` / `DELETE`: only when the file path is `<auth0_user_id>/...` and the request is authenticated as that user (we'll route writes through an edge function with the service role, so the policy is mostly defense-in-depth).

**Edge function `sync-profile`** — extend with two new actions (keeps Auth0 JWT verification + rate limiting we already have):
- `action: 'update_profile'` → `{ display_name?: string, avatar_url?: string | null }` → updates the caller's `profiles` row, returns the updated profile + roles. Sanitizes inputs (already have `sanitizeString`).
- `action: 'upload_avatar'` → `{ file_base64: string, content_type: string, file_name: string }` → validates type (`image/jpeg`, `image/png`, `image/webp`), validates size ≤ **2 MB**, uploads to `avatars/<user_id>/<timestamp>_<name>`, deletes any previous avatar files under that prefix, updates `profiles.avatar_url` with the public URL, returns the updated profile.

When no `action` field is sent, the function keeps its current behavior (login-time sync) for backward compatibility.

### Frontend

**`src/contexts/AuthContext.tsx`**
- Add `refreshProfile()` method that re-runs the existing `syncProfile` so Topbar/Sidebar avatars and the Settings page update immediately after a save.

**`src/pages/SettingsPage.tsx`** — turn the read-only profile card into an editable form:

- **Avatar block (left)**:
  - Render the current avatar at **96×96** (the "professional" target size).
  - Below it, a small caption: "Recommended: square image, 256×256, max 2 MB. JPG, PNG, or WEBP."
  - "Change photo" button opens the OS file picker (`<input type="file" accept="image/png,image/jpeg,image/webp" />`).
  - On select: validate type + ≤ 2 MB client-side; **client-side resize** to 256×256 square via `<canvas>` with `object-fit: cover` cropping (so what the user sees matches what gets stored — that's the "professional avatar size" guarantee). Show a live preview replacing the avatar before they confirm.
  - "Upload" + "Cancel" buttons appear once a file is staged. Upload calls `supabase.functions.invoke('sync-profile', { body: { action: 'upload_avatar', ... } })` with the resized image as base64. On success: toast, call `refreshProfile()`.
  - Small "Remove photo" link if `user.avatarUrl` is set → calls `update_profile` with `avatar_url: null`.

- **Name block (right)**:
  - `Input` bound to local state, prefilled with `user.displayName`.
  - `Save` button enabled only when changed; trims, requires 2–100 chars. Calls `update_profile` action → toast → `refreshProfile()`.
  - Email and roles stay read-only (managed by Admin Console).

- Existing **Notification Sounds** card is untouched.

## File impact

```text
db    new migration                                       create 'avatars' public storage bucket + RLS policies
edit  supabase/functions/sync-profile/index.ts            add 'update_profile' and 'upload_avatar' actions
edit  src/contexts/AuthContext.tsx                        expose refreshProfile()
edit  src/components/layout/TopBar.tsx                    add Refresh button (invalidates all queries, spins while fetching)
edit  src/pages/SettingsPage.tsx                          editable display name + avatar upload with 96px preview & client-side resize
```

No changes to individual page components, navigation, or other edge functions.


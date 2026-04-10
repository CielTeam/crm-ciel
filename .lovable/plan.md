

# Fix Notification Sounds + Add Sound Preferences

## Root Cause: Why Sounds Don't Play

The realtime subscription in `useNotificationsRealtime` uses `postgres_changes` on the `notifications` table, filtered by `user_id=eq.${user.id}`. However, the RLS SELECT policy on `notifications` checks `user_id = current_setting('request.headers')::json->>'x-auth0-sub'` — a custom header. The Supabase JS client never sets this header on its realtime WebSocket connection, so **RLS blocks all realtime events** and the client never receives INSERT payloads. No payloads → no sounds.

## Fix Approach

### 1. Server-side: Broadcast after every notification insert

In each edge function that inserts into `notifications` (`tasks`, `messages`, `leaves`), add a Supabase Realtime broadcast immediately after the insert:

```typescript
const channel = admin.channel(`user-notify-${userId}`);
await channel.send({
  type: 'broadcast',
  event: 'new_notification',
  payload: { id, type, title, body, reference_id, reference_type }
});
await admin.removeChannel(channel);
```

This bypasses RLS entirely since broadcast channels don't go through Postgres.

### 2. Client-side: Listen to broadcast instead of postgres_changes

Rewrite `useNotificationsRealtime` to subscribe to `user-notify-${user.id}` broadcast channel. On receiving `new_notification`, play the appropriate sound (checking user preferences first), show toast, show browser notification, and invalidate queries.

### 3. Sound preferences in Settings page

Replace the "coming soon" placeholder card with a **Notification Sounds** card containing three switches (using the existing `Switch` component):

- **Message sounds** — toggle for new message alerts
- **Task sounds** — toggle for task assignment/status alerts
- **Notification sounds** — toggle for general notifications (leaves, etc.)

Store preferences in `localStorage` under key `sound-prefs-{userId}` as JSON:
```json
{ "messages": true, "tasks": true, "notifications": true }
```

All three default to `true`. Each user's preferences are independent.

### 4. Create a shared hook for sound preferences

New file `src/hooks/useSoundPreferences.ts`:
- `useSoundPreferences()` returns `{ messages, tasks, notifications, toggle(key) }`
- Reads/writes localStorage
- Used by both `useNotificationsRealtime` (to check before playing) and `SettingsPage` (to render toggles)

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useSoundPreferences.ts` | **New** — localStorage-backed sound preference hook |
| `src/hooks/useNotifications.ts` | Switch from postgres_changes to broadcast channel; check sound prefs before playing |
| `src/pages/SettingsPage.tsx` | Add Notification Sounds card with 3 Switch toggles |
| `supabase/functions/tasks/index.ts` | Add broadcast after each notification insert (6 locations) |
| `supabase/functions/messages/index.ts` | Add broadcast after notification insert |
| `supabase/functions/leaves/index.ts` | Add broadcast after notification insert |

Edge functions will be redeployed after changes.


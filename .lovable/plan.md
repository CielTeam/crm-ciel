

# Fix Task Creation Error + Messaging Improvements

## Issue 1: Task creation 500 error — `tasks_status_check` constraint

**Root cause**: The database has a CHECK constraint `tasks_status_check` that only allows `todo`, `in_progress`, `done`. The edge function tries to insert `pending_accept` for assigned tasks, which the DB rejects. The error is then serialized as `[object Object]` because the catch block does `String(err)` on a Postgres error object.

**Fix**: Database migration to expand the CHECK constraint to include all statuses the system uses: `todo`, `in_progress`, `done`, `pending_accept`, `approved`, `declined`, `submitted`.

Also fix the error serialization in the edge function catch block to properly stringify error objects.

## Issue 2: Task creation dialog not fully visible on small screens

**Fix**: Make the dialog scrollable by wrapping the form content in a `ScrollArea` with `max-h-[80vh]` and add `overflow-y-auto` so all fields are accessible on any screen size.

## Issue 3: Sent message bubble is blue — blue read ticks invisible

**Fix**: Change the sender's message bubble from `bg-primary text-primary-foreground` to a neutral dark color like `bg-slate-700 text-white` (dark theme friendly: `dark:bg-slate-600`). This makes blue checkmarks clearly visible.

## Issue 4: Typing indicator disappears after 2 seconds instead of persisting until message sent

**Fix**: 
- Increase `TYPING_EXPIRE_MS` from 2000 to 5000ms in `useChatChannel.ts`
- Add a `stop_typing` broadcast event — sender broadcasts it after sending a message
- The `sendTyping` function should also broadcast on every keystroke (reduce debounce to 200ms so it keeps refreshing the timer)
- In `MessageInput`, call a new `sendStopTyping` callback after `onSend` completes

## Issue 5: Messages don't appear in real-time for the other user already in the chat

**Fix**: The `useMessagesRealtime` hook subscribes to `postgres_changes` on the `messages` table, filtered by `conversation_id`. This relies on Supabase Realtime being enabled for the `messages` table. The current RLS policy for `messages` SELECT uses a subquery on `conversation_members` which has a self-referencing bug (`cm.conversation_id = cm.id` instead of `cm.conversation_id = messages.conversation_id`). However, since the edge function inserts via service_role, the INSERT event should still fire.

The more likely issue: the realtime channel filter uses `conversation_id=eq.${conversationId}` but the `conversation_id` column is `uuid` type — the filter string format should work. Let me check if there's a simpler issue: the hook skips messages from the current user (`if (newMsg.sender_id === userId) return`), which is correct. For the OTHER user, the channel subscription should pick up the INSERT. The issue may be that Supabase Realtime is not enabled for the `messages` table, or the RLS policy blocks the realtime subscription.

**Fix approach**: Since the system already uses broadcast channels (`chat-{conversationId}`), add a `new_message` broadcast event. When a message is sent successfully, broadcast it on the chat channel. The receiver's `useChatChannel` hook listens for this and appends it to the React Query cache — no dependency on postgres_changes.

---

## Files Modified

| File | Change |
|------|--------|
| **Migration** | Drop and recreate `tasks_status_check` to include `pending_accept`, `approved`, `declined`, `submitted` |
| `supabase/functions/tasks/index.ts` | Fix error serialization in catch block |
| `src/components/tasks/AddTaskDialog.tsx` | Add scroll area wrapper for responsiveness |
| `src/components/messages/MessageThread.tsx` | Change sent bubble from `bg-primary` to `bg-slate-700` |
| `src/hooks/useChatChannel.ts` | Increase typing timeout to 5s, reduce debounce to 200ms, add `stop_typing` event, add `new_message` broadcast listener |
| `src/components/messages/MessageInput.tsx` | Call `onStopTyping` after send |
| `src/pages/MessagesPage.tsx` | Broadcast `new_message` on send success, pass `sendStopTyping` to MessageInput |
| `src/hooks/useMessages.ts` | Remove duplicate message guard in realtime (keep as fallback) |


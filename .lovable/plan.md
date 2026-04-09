
Goal: fix the 7 requested issues without changing the app’s overall structure.

Assumption: for “zip or size less than 5MB”, I’ll treat that as “allow .zip attachments too, while keeping the 5MB max for every file.” I will not auto-compress files unless you later want that.

What I found
- Notifications/sounds are currently tied to `useUnreadCount()` inside `AppSidebar`. If I only remove the sidebar Notifications link, the bell badge and realtime notification sounds would stop unless that logic is moved elsewhere.
- There is only one generic sound today (`playNotificationSound`), so messages/tasks/other notifications are not differentiated.
- Message attachments already have a download UI component, but `MessagesPage` never loads or passes `messageAttachments` into `MessageThread`, so recipients cannot actually see/download them in chat.
- The current task status DB constraint is incomplete: the UI and edge function use `accepted` and `rejected`, but the latest migration only allows `todo`, `in_progress`, `done`, `pending_accept`, `approved`, `declined`, `submitted`. That is why accepting a task fails.

Implementation plan

1. Move notifications to the bell only
- Remove the Notifications item from `src/config/navigation.ts`.
- Remove the sidebar badge-injection logic from `src/components/layout/AppSidebar.tsx`.
- Move unread-count + realtime notification subscription to the top bar, so the bell becomes the single notification entry point.
- Add a visible unread badge to `src/components/layout/TopBar.tsx`.
- Keep the `/notifications` page, but access it from the bell button only.

2. Add 3 distinct alert sounds with chat-aware behavior
- Expand `src/lib/notifications.ts` to expose separate Web Audio sounds:
  - message sound
  - notification sound
  - task sound
- Refactor `src/hooks/useNotifications.ts` so sound choice is based on notification type:
  - `new_message` -> message sound
  - task-related types (`task_assigned`, `task_status_changed`, `task_completed`, etc.) -> task sound
  - everything else -> generic notification sound
- Suppress the message sound when the user is already viewing that exact conversation.
- Still play the message sound if the user is:
  - outside Messages entirely, or
  - inside Messages but on a different conversation

3. Make active-chat detection reliable
- Sync the selected chat into the URL, e.g. `/messages?conversation=<id>`, inside `src/pages/MessagesPage.tsx`.
- Use that active conversation id from the layout/top bar notification listener to decide whether to suppress or play the incoming message sound.
- Update notification navigation so message notifications can open the exact conversation instead of only `/messages`.

4. Fix task accept/decline errors properly
- Add a new migration that replaces `tasks_status_check` with the full workflow actually used by the app:
  - `todo`
  - `in_progress`
  - `done`
  - `pending_accept`
  - `accepted`
  - `declined`
  - `submitted`
  - `approved`
  - `rejected`
- Keep the edge function error handling readable in `supabase/functions/tasks/index.ts`.
- Add a small server-side status whitelist/transition guard so future invalid statuses fail with a clear 400-style error instead of another DB-driven 500.

5. Make message attachments visible and downloadable
- Extend the attachments flow so chat screens can fetch message attachments for the open conversation, not just single task/comment entities.
- Build a message-attachment map in `src/pages/MessagesPage.tsx` and pass it into `MessageThread`.
- Reuse `FileAttachmentList` in chat bubbles so every received attachment shows a download action.
- Update the attachments edge function to return signed download URLs with a forced filename/download behavior, so files download reliably instead of opening ambiguously in a new tab.

6. Add ZIP support while keeping the 5MB cap
- Update shared frontend validation in:
  - `src/components/shared/FileUploadButton.tsx`
  - `src/hooks/useAttachments.ts`
- Update backend validation in `supabase/functions/attachments/index.ts` to allow `.zip` and its content type while preserving the private bucket + signed URL model.
- Keep the hard 5MB limit for all attachment uploads.

7. Keep chat attachments in sync after upload
- After a message attachment upload succeeds, invalidate/refetch the message-attachments query for the open conversation.
- If needed during implementation, I’ll also add a lightweight chat broadcast refresh so both sides see the attachment without a reload.

Technical details / files likely touched
- `src/lib/notifications.ts`
- `src/hooks/useNotifications.ts`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/config/navigation.ts`
- `src/pages/MessagesPage.tsx`
- `src/pages/NotificationsPage.tsx`
- `src/components/messages/MessageThread.tsx`
- `src/components/shared/FileAttachmentList.tsx`
- `src/components/shared/FileUploadButton.tsx`
- `src/hooks/useAttachments.ts`
- `supabase/functions/attachments/index.ts`
- `supabase/functions/tasks/index.ts`
- `supabase/migrations/<new migration>.sql`

Verification checklist
- Receive a new message while viewing the same chat: no sound.
- Receive a new message while on another chat: message sound plays.
- Receive a non-message notification: generic notification sound plays.
- Receive a task notification: task sound plays.
- Notifications are no longer shown in the sidebar; only the bell shows them.
- Accepting a task changes it to `accepted` without error.
- Rejecting/reviewing assigned tasks also works with the corrected status constraint.
- A received message attachment appears in the thread and downloads correctly.
- ZIP uploads under 5MB are accepted; files over 5MB are rejected with a clear message.

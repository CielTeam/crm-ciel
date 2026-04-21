

# Five fixes: notifications, chat UX, leads/conversion, lead→tasks, calendar reminders

## 1. Sync message notifications with read state

When a conversation is read in the Messages page, all `notifications` rows of type `new_message` for that conversation must be marked read so they disappear from the bell badge and the Unread tab.

**Backend — `supabase/functions/messages/index.ts`** (extend `mark_read` action):
- After updating `conversation_members.last_read_at`, also run:
  ```
  UPDATE notifications
  SET is_read = true
  WHERE user_id = actorId
    AND type = 'new_message'
    AND reference_type = 'conversation'
    AND reference_id = conversation_id
    AND is_read = false
  ```
- Broadcast `notifications_read` event on `user-notify-{actorId}` so the bell refreshes instantly.

**Backend — `supabase/functions/messages/index.ts`** (extend `send_message` action):
- Skip inserting a `new_message` notification for any recipient who is currently a member of the conversation **and** whose `last_read_at` is within the last 60 seconds (treat as actively viewing) — minor optimization, optional.

**Frontend — `src/hooks/useNotifications.ts`**:
- Add a second broadcast handler for `notifications_read`: invalidates `['notifications']` and `['notifications-unread-count']`.

**Frontend — `src/pages/MessagesPage.tsx`**:
- After `markRead.mutate(selectedId)` (already in `useEffect` on conversation open), add a sibling call: `qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })` (defense in depth in case broadcast is missed).

## 2. Restyle chat — slate + purple, drop heavy blue

Replace the blue palette in chat with a dark-slate surface + violet accent for own messages and a clearer light surface for incoming messages. Stays inside the existing semantic token system (no hard-coded brand color drift outside chat).

**`src/index.css`** — add chat-scoped CSS variables (light + dark blocks):
- `--chat-bubble-mine`, `--chat-bubble-mine-fg` → violet 600/50 (light) and violet 500/95 (dark)
- `--chat-bubble-other`, `--chat-bubble-other-fg` → slate 100/900 (light) and slate 800/100 (dark)
- `--chat-meta`, `--chat-read` → muted neutral + violet-300 for read receipts
- `--chat-surface` for the panel background to soften from pure card

**`src/components/messages/MessageThread.tsx`**:
- `isMine` bubble: `bg-[hsl(var(--chat-bubble-mine))] text-[hsl(var(--chat-bubble-mine-fg))]`
- Other bubble: `bg-[hsl(var(--chat-bubble-other))] text-[hsl(var(--chat-bubble-other-fg))]`
- Read-receipt double-check uses `text-[hsl(var(--chat-read))]` instead of `text-blue-400`
- Sender name on group chats: stronger contrast (`opacity-80` + `font-semibold`).

**`src/components/messages/ConversationList.tsx`**:
- Active row: `bg-[hsl(var(--chat-bubble-mine))]/15 border-l-2 border-[hsl(var(--chat-bubble-mine))]`
- Avatar fallback: switch from `bg-primary/10 text-primary` to `bg-[hsl(var(--chat-bubble-mine))]/15 text-[hsl(var(--chat-bubble-mine))]`
- Unread badge: `bg-[hsl(var(--chat-bubble-mine))] text-white`

**`src/components/messages/ChatHeader.tsx`** + **`MessageInput.tsx`**:
- Replace `text-primary` / `bg-primary/10` references with the same chat tokens. Send button uses `bg-[hsl(var(--chat-bubble-mine))]`.
- Slightly increase font-weight on names and improve focus ring on the textarea.

Sidebar, top bar, dashboards, leads, etc. are untouched — primary blue stays elsewhere.

## 3. Hide converted leads from the Leads page (archive on conversion)

Today, conversion only stamps `converted_at` on the lead — the row still shows in every Leads view. Treat conversion as immediate archival.

**Backend — `supabase/functions/leads/index.ts`**:
- In every list-side action (`list`, `list_with_services`, `stats`, `bulk_*`) default to `query.is('converted_at', null)` **unless** `filters.converted === true` (then only converted) or `filters.converted === 'all'` (then no filter — used by saved Converted view).
- Conversion already updates `converted_at`; no additional write needed.
- `unconvert` already clears `converted_at` → row reappears automatically.

**Frontend — `src/components/leads/LeadsFilterBar.tsx`** + `LeadFilters` shape:
- Replace `converted?: boolean` with `converted?: 'open' | 'converted' | 'all'` (default `'open'`).
- Add a small `Show: Open / Converted / All` toggle in the filter bar.

**Frontend — `src/components/leads/LeadStatsCards.tsx`** / `LeadsAnalyticsView` / `LeadsKanbanView`:
- These read from filtered list, so they automatically exclude converted; no extra change.

**Frontend — `src/components/leads/LeadDetailSheet.tsx`**:
- Keep the existing "Undo Conversion" entry point (it already calls `useUnconvertLead`) — once executed, the lead reappears in default view since `converted_at` is cleared.

## 4. Lead → Task creation that lands in the assignee's Tasks page (and marks origin)

Today the lead detail sheet's "Tasks" tab is a placeholder. Make it a full create + list panel that links the task to the lead, and show "From Lead" provenance everywhere a task surfaces.

**Database — single migration**:
- Add `lead_id uuid` column to `tasks` (nullable, indexed). Mirrors existing `account_id` / `ticket_id` link columns. No FK needed (matches existing convention).

**Backend — `supabase/functions/tasks/index.ts`**:
- Add `lead_id` to allowed create + update fields (already has the `account_id` / `ticket_id` shape — extend the same `allowedFields` array and `create` insert payload).
- On `create` with `lead_id`, validate the lead exists and the actor passes `has_leads_access_scoped` (call existing helper with the lead's `assigned_to`).
- Add new action `list_by_lead { lead_id }` returning tasks where `lead_id = ?`, scoped to caller via existing visibility rules. Used by the lead detail Tasks tab.
- After insert, append `lead_activities` row (`activity_type: 'task_created'`, links to the new task) so it shows up in the Lead Activity timeline.

**Frontend — new component `src/components/leads/LeadTasksPanel.tsx`**:
- Replaces the placeholder `<TabsContent value="tasks">` body in `LeadDetailSheet.tsx`.
- Lists tasks via new `useTasksByLead(leadId)` hook (wraps `list_by_lead`).
- "Add Task" button opens the existing `AddTaskDialog`, but wrapped to inject `lead_id` in the submit payload and pre-fill `description` with `"From lead: {company_name} — {contact_name}"`.
- Each row shows assignee avatar, status badge, due date, click-through opens existing `TaskDetailSheet`.

**Frontend — `src/hooks/useTasks.ts`**:
- Extend `useCreateTask` payload type to accept `lead_id?: string | null` (and `account_id?`, `ticket_id?` for parity).
- Add `useTasksByLead(leadId)`.

**Frontend — `src/components/tasks/TaskCard.tsx` + `TaskDetailSheet.tsx`**:
- When `task.lead_id` is set, render a small purple `From Lead` chip near the title (uses `Building2` icon). On click in the detail sheet, open the lead in `LeadDetailSheet` (via a new `?lead={id}` query param handler in `LeadsPage` — non-blocking polish; v1 just shows the chip).
- Surface `lead_id` in the `Task` interface in `useTasks.ts`.

**Notifications**:
- Already covered: `tasks/create` already sends `task_assigned` notification + broadcast to the assignee. Title is augmented with `(from lead: {company_name})` when `lead_id` is set, by reading the lead's company name in the create handler.

## 5. Calendar reminders not firing — finish the wiring

Reminders schedule + render in the calendar but no notification arrives. Three concrete root causes to fix:

### 5a. Cron job is not actually scheduled

The previous step asked the user to run the SQL manually with the anon key, which they did not. Schedule it programmatically using the **insert/SQL tool** (not a migration), pulling values from secrets so it never leaks the key:
```
SELECT cron.schedule(
  'reminders-dispatch-every-minute',
  '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://orkbfoviqjijcoqtihuu.supabase.co/functions/v1/reminders-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <SUPABASE_ANON_KEY>'
    ),
    body := '{}'::jsonb
  ); $$
);
```
Pre-flight: ensure `pg_cron` and `pg_net` extensions are enabled (verify, do not migrate if already present). Also drop any duplicate prior schedule with the same name first (`SELECT cron.unschedule('reminders-dispatch-every-minute')` wrapped in a `DO` block that ignores not-found).

### 5b. Dispatcher batch query is too narrow

`supabase/functions/reminders-dispatch/index.ts` currently selects only `fire_at > now() - 15 min AND fire_at <= now()`. If the cron was off for >15 min OR a user creates a "0-minute" reminder for an event already started, rows are silently `cancelled` as stale by the second query. Fix:

- Widen the "claim" window to `fire_at <= now() + 30s` (catches reminders that became due in the same minute, including 0-offset on near-future events).
- Move the stale-cleanup into the same loop and only cancel rows older than **60 minutes** (not 15) — gives the dispatcher headroom after outages.
- Ensure `0` minute offset is allowed end-to-end (Zod schema already permits `min(0)`; just verify the create path doesn't drop reminders whose `fire_at` is already <= now at insert time — currently it inserts them as `pending`, which is correct).

### 5c. Notifications not appearing for the organizer in some cases

Inspect: dispatcher inserts into `notifications` and broadcasts to `user-notify-{userId}`. Two issues:
- The broadcast `payload` does not include `id`, but `useNotifications` real-time handler reads `row.id` for the toast `tag`. Already nullable, so harmless — but include `id` anyway for browser-notification de-dup.
- The dispatcher `audit_logs` insert uses `actor_id: 'system'`. The `audit_logs.actor_id` column is `not null` and has no constraint, so this works — keep.

Add **defensive client invalidation**: in `useNotifications.useNotificationsRealtime`, when receiving a broadcast with `type === 'event_reminder'`, also invalidate `['calendar-events']` so the event detail sheet shows the most recent reminder dispatch state.

### 5d. Smoke test (post-implementation)
- Create an event 2 min in the future with reminders `[2, 0]`, log in as both organizer and a participant, wait for cron tick → expect bell badge increments, toast appears, sound plays, browser push fires (if granted), and clicking the notification deep-links to `/calendar?event={id}` with the detail sheet open.
- Inspect `event_reminders` rows: `status = 'sent'`, `sent_at` populated, no `error`.
- Inspect `notifications` rows for type `event_reminder` linked to the event id.

## File impact

```
Database (1 migration)
  add `tasks.lead_id uuid` + index

Insert tool (no migration)
  schedule reminders-dispatch cron job (with anon key from secrets)

Backend edge functions (4 edits)
  supabase/functions/messages/index.ts        — extend mark_read + send_message
  supabase/functions/leads/index.ts           — converted=open default + 'all' option
  supabase/functions/tasks/index.ts           — lead_id field, list_by_lead, lead-aware notif
  supabase/functions/reminders-dispatch/index.ts — wider claim window + stale cleanup

Frontend (≈10 edits, 1 new file, 0 deletes)
  src/index.css                               — chat color tokens (slate + violet)
  src/hooks/useMessages.ts                    — invalidate notifications on mark_read
  src/hooks/useNotifications.ts               — handle notifications_read broadcast + invalidate calendar
  src/hooks/useTasks.ts                       — lead_id in payload + useTasksByLead
  src/pages/MessagesPage.tsx                  — minor wiring after mark_read
  src/components/messages/MessageThread.tsx   — chat palette
  src/components/messages/ConversationList.tsx — chat palette
  src/components/messages/ChatHeader.tsx      — chat palette
  src/components/messages/MessageInput.tsx    — chat palette
  src/components/leads/LeadsFilterBar.tsx     — converted toggle (open/converted/all)
  src/pages/LeadsPage.tsx                     — pass converted='open' default
  src/components/leads/LeadDetailSheet.tsx    — replace tasks placeholder
  src/components/leads/LeadTasksPanel.tsx     — NEW: lead-scoped tasks UI
  src/components/tasks/TaskCard.tsx           — "From Lead" chip
  src/components/tasks/TaskDetailSheet.tsx    — "From Lead" chip
```

## Out of scope (callouts)

- Re-architecting chat to a fully separate "chat surface" theme — only the message bubbles + inputs are restyled.
- Bidirectional Lead↔Task deep linking via URL params (chip is shown; click-through navigation is a follow-up if needed).
- Email channel for reminders (still reserved in enum, dispatcher continues to skip).


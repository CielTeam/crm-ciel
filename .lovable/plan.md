

# Phase B — Calendar Events + Reminder Engine

Goal: turn the read-only aggregator calendar into a first-class scheduling surface with native `calendar_events` (own/shared/team), unified aggregation (events + tasks + leaves + tickets), and a reliable reminder dispatcher (in-app + browser push), all RBAC-scoped via `get_visible_user_ids`.

Phase B is strictly **scheduling + reminders**. PDF export is Phase C. Meetings/Google FreeBusy stays out (already a separate future module).

## 1. Database (single migration)

**Enums**
- `calendar_event_type_enum`: `meeting`, `deadline`, `reminder`, `personal`, `block`, `ticket_due`, `task_due`
- `calendar_visibility_enum`: `private`, `participants`, `department`, `management_chain`
- `reminder_channel_enum`: `in_app`, `browser_push`, `email` (email reserved, not wired Phase B)
- `reminder_status_enum`: `pending`, `sent`, `failed`, `cancelled`

**Tables**
- `calendar_events` — `id`, `title`, `description`, `event_type`, `start_time tstz NOT NULL`, `end_time tstz NOT NULL`, `all_day bool default false`, `location text`, `visibility calendar_visibility_enum default 'private'`, `created_by text`, `owner_user_id text` (primary owner), `account_id uuid NULL`, `ticket_id uuid NULL`, `task_id uuid NULL`, `recurrence_rule text NULL` (RFC5545 RRULE string; expansion deferred — store-only Phase B), `color text NULL`, `created_at`, `updated_at`, `deleted_at NULL`
- `calendar_event_participants` — `id`, `event_id`, `user_id text`, `response text default 'pending'` (`pending|accepted|declined|tentative`), `is_organizer bool default false`, `created_at`. Unique `(event_id, user_id)`.
- `event_reminders` — `id`, `event_id`, `user_id text` (target — denormalized for fast cron query), `channel reminder_channel_enum`, `offset_minutes int NOT NULL` (positive = before start), `fire_at tstz NOT NULL` (computed = start_time − offset; indexed), `status reminder_status_enum default 'pending'`, `sent_at NULL`, `error text NULL`, `created_at`. Index `(status, fire_at)` for the dispatcher.

**Indexes**: `calendar_events(start_time)`, `calendar_events(owner_user_id, start_time)`, `calendar_events(account_id)`, `calendar_events(ticket_id)`, `calendar_event_participants(user_id, event_id)`, `event_reminders(status, fire_at)`.

**RBAC helper**
- `has_event_access(_user_id, _event_id) returns boolean` — true if creator/owner, listed participant, visibility=`department` and same dept as owner, visibility=`management_chain` and caller in `get_visible_user_ids(owner)`, or admin/exec roles.

**RLS**
- `calendar_events`, `calendar_event_participants`: SELECT via `has_event_access`; ALL = service_role
- `event_reminders`: SELECT only for target `user_id = jwt_sub`; ALL = service_role

**No CHECK on `fire_at > now()`** — use the dispatcher to skip stale rows. Keeps with the validation-trigger rule.

## 2. Edge functions

### `calendar-events/index.ts` (new)
Zod-validated, JWT-verified actions:
- `list` — params: `from`, `to` (≤ 90 days), `include_aggregated bool` (default true). Returns native events the caller can see (`has_event_access` filtered server-side via `get_visible_user_ids`) + optional aggregation feed (tasks with `due_date`, leaves, ticket synthetic `ticket_due` rows for tickets in `has_ticket_access` scope). Single normalized response shape.
- `create`, `update`, `delete` (soft) — `start_time < end_time` validated; participants array upserted atomically; default reminder offsets [`60`, `15`] in_app per organizer unless `reminders=[]` explicitly passed; recomputes `fire_at` on update.
- `respond` — participant sets `response`; organizer-only fields blocked.
- `add_reminder`, `delete_reminder` — caller may only manage own reminders (target_user_id = jwt_sub).
- All writes audit-logged + emit `calendar_event_*` activity into existing `audit_logs`.

### `reminders-dispatch/index.ts` (new — cron target)
- Scheduled every minute via `pg_cron` + `pg_net` (insert tool, NOT migration — per your secrets rule)
- Selects `event_reminders WHERE status='pending' AND fire_at <= now() AND fire_at > now() - interval '15 minutes'` (drop stale)
- For each: fetch event + verify access still valid; insert into `notifications` (existing table) with `type='event_reminder'`, `reference_id=event_id`, `reference_type='calendar_event'`; broadcast on `user-notify-{userId}` channel (matches existing real-time pattern — see mem://architecture/real-time-notifications); mark `sent`. Failures → `failed` with `error`.
- Idempotent: claim with `UPDATE ... WHERE status='pending' RETURNING id` before processing.

### `tasks/index.ts` & `tickets/index.ts` (light extension)
- On create/update of task with `due_date` or ticket with high/urgent priority, no separate calendar row is written (avoids dual-source bugs). Aggregation is read-side only via `calendar-events.list`. **Single source of truth preserved.**

## 3. Frontend

**New hook**
- `src/hooks/useCalendarData.ts` — wraps `calendar-events.list` for the visible window (replaces the local-merge `useCalendarEvents`). Returns normalized `CalendarEvent[]` with `source: 'event' | 'task' | 'leave' | 'ticket'`. Old `useCalendarEvents` deleted.

**Refactor existing**
- `CalendarEvent` interface gains `source`, `eventId?`, `linkedAccountId?`, `linkedTicketId?`, `linkedTaskId?`, `participants?`.
- `CalendarEventChip.tsx` — adds `ticket` icon mapping; click emits event id.
- `MonthView` / `WeekView` / `DayView` — unchanged grid logic; pass through click handler that opens detail sheet.

**New components (`src/components/calendar/`)**
- `EventDetailSheet.tsx` — tabs: Details, Participants (with response chips), Reminders, Linked (account/ticket/task chips). Edit + delete for organizer; respond for participants.
- `AddEventDialog.tsx` — fields: title, type, start/end, all-day toggle, location, visibility, participants picker (uses existing directory data), reminders editor (default 60 + 15 min, custom add), optional account/ticket/task link pickers.
- `ReminderEditor.tsx` — small subcomponent: list of `{channel, offset_minutes}` rows with add/remove.
- `EventResponseChip.tsx` — accepted/declined/tentative pill.

**CalendarPage.tsx edits**
- Add "New Event" button in toolbar.
- Pass visible window (`from`/`to`) to `useCalendarData`.
- Click on any chip opens `EventDetailSheet` (read-only for synthetic task/leave/ticket sources; opens linked entity sheet instead).

**Notification path**
- `useNotifications` already routes `type='event_reminder'` clicks: extend the existing notification click handler in `TopBar`/`useNotifications` to navigate to `/calendar?event={reference_id}` and open `EventDetailSheet`.
- `lib/notifications.ts` — add `playReminderSound()` (single soft chime, lower volume than task alert) and reuse `showBrowserNotification` for push.

**Sidebar** — no change (Calendar already there).

## 4. Cron setup (insert tool, not migration)

```sql
SELECT cron.schedule(
  'reminders-dispatch-every-minute',
  '* * * * *',
  $$ SELECT net.http_post(
    url:='https://<project>.supabase.co/functions/v1/reminders-dispatch',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <ANON>"}'::jsonb,
    body:='{}'::jsonb
  ) $$
);
```

Verify `pg_cron` + `pg_net` extensions enabled before scheduling.

## 5. Security & integrity commitments

- Every list capped (events ≤ 1000 rows / 90-day window; reminders dispatcher batch ≤ 500/run)
- Participant adds restricted to caller's `get_visible_user_ids` set (no cross-org invites)
- `event_reminders.fire_at` recomputed server-side, never trusted from client
- Audit log on: event create/update/delete, participant invite/respond, reminder add/delete, dispatcher send/fail
- Reminders dispatcher is the **only** writer to `notifications` for `event_reminder` type
- `calendar-events.list` re-validates `has_event_access` per row even though RLS would also enforce it — defense in depth

## 6. Non-goals for Phase B
- No recurrence expansion (RRULE stored, single-instance render only — expansion = Phase B.5 if needed)
- No email reminders (`email` channel reserved in enum, dispatcher skips)
- No Google Calendar sync (Meetings module's domain)
- No PDF export (Phase C)
- No drag-to-create or drag-to-reschedule (post-stability)

## 7. File impact
- 1 migration (schema + RLS + helper)
- 1 insert-tool SQL block (cron schedule)
- 2 new edge functions (`calendar-events`, `reminders-dispatch`)
- ~9 frontend files (1 new hook, 4 new components, 4 edited: `CalendarPage`, `CalendarEventChip`, `useNotifications` click handler, `lib/notifications.ts`); 1 deleted (`useCalendarEvents.ts`)

After implementation I'll pause for review before Phase C (Arabic-capable PDF export, with a real generated sample as you required).


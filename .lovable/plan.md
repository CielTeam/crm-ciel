

# Four fixes: task actions, blue ticks, lead/account solutions, More popover overflow

## 1. Approve / Reject (and Accept / Decline / Submit / Start) do nothing inside the lead's Tasks tab

Root cause: `LeadTasksPanel.tsx` mounts `TaskDetailSheet` with **stub no-op handlers** for `onActionClick`, `onStatusChange`, `onMarkDone`, `onMarkUndone`, `onTogglePin`. The sheet's Approve/Reject buttons call `onActionClick('approve' | 'reject')` → nothing happens. `TasksPage.tsx` already has the correct wiring (opens `AcceptDeclineDialog` / `SubmitTaskDialog` / `ReviewTaskDialog`).

Fix — refactor `LeadTasksPanel.tsx` to mirror the `TasksPage` pattern:
- Add `sheetAction` state (`'accept' | 'decline' | 'submit' | 'approve' | 'reject' | null`).
- Wire `onActionClick={(a) => setSheetAction(a)}`.
- Wire `onStatusChange` to a new local mutation that calls the `tasks` edge function with `action: 'update_status'` (used by Start Working / Resume Work).
- Wire `onMarkDone` / `onMarkUndone` / `onTogglePin` to the existing hooks `useMarkTaskDone`, `useMarkTaskUndone`, `useTogglePin` from `useTasks.ts`.
- Mount `AcceptDeclineDialog`, `SubmitTaskDialog`, `ReviewTaskDialog` conditionally (same shape as `TasksPage` lines 386–420), each calling the existing mutations (`useAcceptTask`, `useDeclineTask`, `useSubmitTask`, `useApproveTask`, `useRejectTask`).
- After any successful action invalidate `['lead-tasks', lead.id]` and `['tasks']`.

Result: clicking Approve / Reject inside the Lead → Tasks tab opens the same review dialog used in the global Tasks page and the status transitions (and writes activity + notifications) just like elsewhere.

## 2. Blue read-receipt ticks not visible

Root cause: when chat was restyled to violet, `--chat-read` was set to violet (`270 95% 78%`). The "seen" state now blends into the violet "mine" bubble — the WhatsApp-style **blue** double-check is gone.

Fix — `src/index.css`:
- Light: `--chat-read: 210 100% 56%;` (vivid blue)
- Dark: `--chat-read: 210 100% 65%;` (slightly lighter for dark surfaces)

Optional polish in `MessageThread.tsx` — bump the seen tick to `h-3.5 w-3.5` so it reads clearly against the violet bubble. The `delivered` state stays as the muted on-bubble color (single gray check, two muted checks), `seen` becomes blue — matches user expectation.

## 3. Solutions section: remove from lead creation, add to account creation

### 3a. Remove from `AddLeadDialog.tsx`
- Delete the entire `Solutions / Services` block (the trailing `<Separator />` + the `<div>…</div>` from "Solutions / Services" through the rows; lines ~239–282).
- Drop the now-unused state: `solutions`, `setSolutions`, `SolutionRow`, `emptySolution`, `SERVICE_TYPES`, `handleTypeChange`, `updateSolution`, `removeSolution`, `validSolutions`, `addService` import + hook call.
- Remove the post-create solution loop in `handleSubmit` (the `Promise.all(validSolutions.map…)` block).
- Trim unused icon imports (`Plus`, `X`).

Solutions can still be added to a lead later via the existing "Solutions" tab inside `LeadDetailSheet` (uses `AddServiceDialog`) — that path is unchanged. So "lead creation" becomes solution-free; "lead lifecycle" still supports them.

### 3b. Add Solutions section to `AddAccountDialog.tsx`
The accounts module currently has no service table at all, so this needs a minimal end-to-end addition:

- **Database (1 migration)**: create `account_services` table mirroring `lead_services`:
  ```
  id uuid pk default gen_random_uuid()
  account_id uuid not null references accounts(id) on delete cascade
  service_name text not null
  start_date date
  expiry_date date not null
  status text not null default 'active'   -- active | expired | renewed | cancelled
  notes text
  created_at, updated_at, deleted_at, created_by
  ```
  Indexes on `account_id` and `expiry_date`. Enable RLS; reuse the visibility helper used by `accounts` (caller must be in `get_visible_user_ids`-scoped accounts). Default-deny for `anon`.

- **Backend — `supabase/functions/accounts/index.ts`**: add three actions:
  - `add_service { account_id, service_name, start_date?, expiry_date }`
  - `list_services { account_id }`
  - `delete_service { service_id }`
  Authorization: caller must own/manage the account.

- **Frontend — `AddAccountDialog.tsx`**: after the Notes block, add a "Solutions / Services" section identical in shape to the one being removed from `AddLeadDialog` (Service Type select with the same `SERVICE_TYPES` list, optional Custom name, Start Date, Expiry Date *required, Add/Remove rows). On submit: after the account is created, loop the rows and call the new `add_service` action (same pattern as the lead version).

- **Frontend — `AccountDetailSheet.tsx`**: add a small "Solutions" section that lists `account_services` and supports add/remove (re-use the same UX as the lead Solutions tab; minimal panel — list rows with name, dates, status badge, and an Add button opening a small inline form). This makes the "keep adding solutions later" flow work for accounts the same way it works for leads.

## 4. "More" filter popover clipped on the right

Root cause: in `LeadsFilterBar.tsx` the More popover uses `<PopoverContent className="w-96 p-3" align="start">`. On a 1002px viewport the trigger sits roughly center-right of the toolbar, so a 384px-wide popover anchored to the trigger's left edge runs past the viewport.

Fix — single line change:
- `<PopoverContent className="w-[min(24rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-3" align="end" sideOffset={4} collisionPadding={16}>`
- `align="end"` anchors to the trigger's right edge → opens leftward.
- `w-[min(24rem,calc(100vw-2rem))]` clamps the popover so it never exceeds viewport width minus a 1rem gutter.
- `max-h-[70vh] overflow-y-auto` protects vertical clipping on short viewports.
- `collisionPadding={16}` lets Radix nudge it inside the viewport if it still overflows.

Apply the same `align="end" + collisionPadding` to the Stage / Owner / Country / Score popovers as a defensive consistency tweak (they're narrower so rarely clip, but it costs nothing).

## File impact

```
Database (1 migration)
  create account_services + indexes + RLS

Backend (1 function edited)
  supabase/functions/accounts/index.ts          — add_service / list_services / delete_service

Frontend (6 edits, 0 new files)
  src/components/leads/LeadTasksPanel.tsx       — wire action handlers + mount review dialogs
  src/index.css                                 — --chat-read = blue (light + dark)
  src/components/leads/AddLeadDialog.tsx        — remove Solutions block + dead state
  src/components/accounts/AddAccountDialog.tsx  — add Solutions section + post-create loop
  src/components/accounts/AccountDetailSheet.tsx — Solutions list/add/remove panel
  src/components/leads/LeadsFilterBar.tsx       — More popover overflow fix (+ defensive align="end")
```

## Out of scope

- Reorganizing the chat receipts UX beyond restoring the blue color (no separate "delivered" iconography rework).
- Bulk service import/export for accounts (only manual add/remove, matching leads parity).
- Backfilling existing leads' converted solutions into the new `account_services` table — conversion-time copy can be added later if needed.


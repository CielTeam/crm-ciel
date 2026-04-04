

# Enterprise Task System Upgrade

This is a large scope upgrade. I'll break it into phases executed sequentially — database first, then backend, then frontend.

## Phase 1 — Database Migration

Add new columns to the `tasks` table:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `pinned` | boolean | false | Important/pinned flag |
| `sort_order` | integer | 0 | Drag-and-drop ordering |
| `started_at` | timestamptz | null | When work began |
| `completion_notes` | text | null | Notes on completion |
| `mark_done_by` | text | null | Who marked done |
| `mark_done_at` | timestamptz | null | When marked done |
| `mark_undone_by` | text | null | Who unmarked done |
| `mark_undone_at` | timestamptz | null | When unmarked |

No new tables needed — activity log already covers audit trail.

## Phase 2 — Backend (Edge Function)

**`supabase/functions/tasks/index.ts`** — extend with:

- **`update` action enhancements**:
  - Auto-set `started_at` when status moves to `in_progress` (if null)
  - Auto-set `completed_at`, `mark_done_by`, `mark_done_at` on done/approved
  - Handle "mark undone": record `mark_undone_by`, `mark_undone_at`, clear `completed_at`, set status back to `in_progress`
  - Add `pinned`, `sort_order`, `started_at`, `completion_notes`, `mark_done_by`, `mark_done_at`, `mark_undone_by`, `mark_undone_at` to allowed update fields
  - Validate pin/unpin permission (creator or lead roles only)

- **`toggle_pin` action** (new):
  - Toggle `pinned` on a task
  - Only creator or lead roles allowed
  - Audit log entry

- **`reorder` action** (new):
  - Accept `{ task_ids: string[] }` — update `sort_order` for each
  - Only allow reordering own tasks or tasks user has authority over

- **`mark_done` / `mark_undone` actions** (new):
  - Explicit actions separate from generic `update`
  - Set appropriate timestamps and fields
  - Generate notifications: "Sarah completed task: API review" sent to task creator
  - Log activity

- **`assignable_users` enhancement**:
  - Global roles (chairman, vice_president) → return ALL users
  - Currently only returns team members for leads — correct but need to also handle "Sales Operation Manager" concept (sales_lead assigns to sales + marketing teams)

- **`list` action enhancement**:
  - Support `tab: 'assigned_by_me'` — tasks where `created_by = actorId AND task_type = 'assigned'`
  - Return tasks ordered by `pinned DESC, sort_order ASC, created_at DESC` by default

## Phase 3 — Frontend Hooks

**`src/hooks/useTasks.ts`** — updates:
- Extend `Task` interface with new fields (`pinned`, `sort_order`, `started_at`, `completion_notes`, `mark_done_by`, etc.)
- Add `useTogglePin()` mutation
- Add `useMarkDone()` and `useMarkUndone()` mutations
- Add `useReorderTasks()` mutation
- Add `'assigned_by_me'` to `TaskTab` type
- Add computed timing helpers (time-to-start, time-to-complete) as a utility function

## Phase 4 — Task Page Overhaul

**`src/pages/TasksPage.tsx`** — major rewrite:
- Add search bar (client-side filter on title/description)
- Add "Assigned by Me" tab
- Add filter chips: All, Pending, In Progress, Completed, Overdue, Pinned
- Add sort options: newest, due date, priority, pinned first, recently updated
- Add view toggle: List view / Board (Kanban) view
- Board view: columns by status, drag between columns to update status
- List view: drag to reorder within same status group
- Install `@dnd-kit/core` + `@dnd-kit/sortable` for drag-and-drop

**New: `src/components/tasks/TaskBoardView.tsx`**:
- Kanban columns: To Do | In Progress | Submitted | Done (personal) or Pending | Accepted | In Progress | Submitted | Approved (assigned)
- Each column shows task cards
- Drag between columns updates status (with permission checks)
- Pinned tasks shown at top of each column with star icon

**New: `src/components/tasks/TaskSearchBar.tsx`**:
- Search input with icon
- Debounced 300ms filter

**`src/components/tasks/TaskCard.tsx`** — enhance:
- Add pin/star icon (toggleable)
- Add "Mark Done" / "Mark Undone" buttons for eligible tasks
- Show assigner name (not just assignee)
- Show time metrics: "Started after 2h 15m", "Completed in 1d 3h", "Waiting: 5h"
- Overdue styling: red border + badge
- Done state: muted with checkmark overlay
- Pinned state: subtle star icon + slightly elevated visual

**`src/components/tasks/TaskDetailSheet.tsx`** — enhance:
- Show timing metrics section (time to start, time to complete, waiting time)
- Show pin/unpin button
- Show mark done/undone button
- Show completion_notes field (editable on submit)
- Show mark_done_by / mark_undone_by in activity

## Phase 5 — Dashboard Integration

**All dashboards** (Employee, Lead, Executive, Driver):
- `RecentTasksList` component — add pinned indicator, overdue styling, clickable to navigate to `/tasks`
- Lead dashboard: show pinned tasks count in stats
- Executive dashboard: no changes needed beyond existing escalation view

## Phase 6 — Notifications Enhancement

The notification system already handles:
- Task assignment → notification to assignee ✓
- Task status change → notification to other party ✓
- Sound + browser push ✓

Enhancements:
- **`mark_done` action**: Send notification with type `task_completed` to creator with message "Sarah completed task: API review"
- **`mark_undone` action**: Send notification to relevant party
- **Pin notification**: No notification needed (personal action)
- Notification click-through already works via `reference_id` + `reference_type` ✓

## Phase 7 — Timing Utility

**New: `src/lib/taskTimings.ts`**:
- `formatDuration(ms)` → "2h 15m", "1d 3h", "5m"
- `getTimeToStart(task)` → duration from `created_at` to `started_at`
- `getTimeToComplete(task)` → duration from `started_at` to `completed_at`
- `getWaitingTime(task)` → duration since `created_at` if not started

## Files Summary

| File | Action |
|------|--------|
| Migration | Add 8 columns to `tasks` table |
| `supabase/functions/tasks/index.ts` | Add toggle_pin, mark_done, mark_undone, reorder, assigned_by_me tab, auto-timestamps |
| `src/hooks/useTasks.ts` | Extend Task type, add new mutations and tab |
| `src/lib/taskTimings.ts` | Create — duration formatting utilities |
| `src/pages/TasksPage.tsx` | Rewrite — search, new tabs, view toggle, board view |
| `src/components/tasks/TaskBoardView.tsx` | Create — Kanban board with dnd-kit |
| `src/components/tasks/TaskSearchBar.tsx` | Create — debounced search input |
| `src/components/tasks/TaskCard.tsx` | Enhance — pin, mark done/undone, timings, overdue styling |
| `src/components/tasks/TaskDetailSheet.tsx` | Enhance — timings section, pin/done controls |
| `src/components/tasks/SubmitTaskDialog.tsx` | Add completion_notes field |
| `src/components/dashboard/RecentTasksList.tsx` | Add pinned indicator, overdue styling |
| `package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

## Dependencies

- `@dnd-kit/core` — drag-and-drop framework
- `@dnd-kit/sortable` — sortable preset
- `@dnd-kit/utilities` — CSS utilities


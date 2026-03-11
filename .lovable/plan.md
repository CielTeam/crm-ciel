

# Advanced Task Workflow

## Overview

Upgrade the task system from simple todo/in_progress/done to a full enterprise workflow with role-based assignment rules, accept/decline flow, lead approval, and new task fields.

## Database Changes (Migration)

Add new columns to `tasks` table:
- `challenges` (text, nullable) — challenges faced during execution
- `estimated_duration` (text, nullable) — estimated completion duration
- `actual_duration` (text, nullable) — actual time taken
- `feedback` (text, nullable) — lead feedback on rejection/approval
- `decline_reason` (text, nullable) — reason for declining
- `task_type` (text, default 'personal') — 'personal' or 'assigned'

Update `status` default to support the full chain:
- **Personal tasks**: `todo` → `in_progress` → `done`
- **Assigned tasks**: `pending_accept` → `accepted` / `declined` → `in_progress` → `submitted` → `approved` / `rejected` → `done`

When a task has `assigned_to` set (and differs from `created_by`), it's an assigned task. Otherwise it's personal.

## Assignment Permission Rules (Edge Function)

**Who can assign to whom:**
- **Global assigners** (Chairman, VP, HR, Head of Operations): can assign tasks to **anyone** including team leads
- **Team leads** (Head of Accounting, Head of Marketing, Sales Lead, Technical Lead, Team Dev Lead): can assign only to **their own team members** (looked up via `team_members` table)
- **Employees**: can only create personal tasks (no assignment to others)

The edge function validates this on `create` and `update` actions.

## Edge Function Changes (`tasks/index.ts`)

### LIST action updates
Add a third tab: `team_tasks` — for leads/executives to see all tasks they've assigned or their team's tasks.

### CREATE action updates
- Validate assignment permissions (global vs team-lead vs employee)
- If `assigned_to` is set and different from `actor_id`, set `status: 'pending_accept'` and `task_type: 'assigned'`
- Otherwise set `task_type: 'personal'`

### UPDATE action updates — new status transitions
Allow the **assignee** (not just creator) to update status on assigned tasks:
- `pending_accept` → `accepted` (by assignee) — with optional note
- `pending_accept` → `declined` (by assignee) — requires `decline_reason`
- `accepted` → `in_progress` (by assignee)
- `in_progress` → `submitted` (by assignee) — can include `challenges`, `actual_duration`
- `submitted` → `approved` (by creator/lead) — sets `completed_at`, optional `feedback`
- `submitted` → `rejected` (by creator/lead) — requires `feedback`, returns to `in_progress`

Personal tasks keep the simple flow: `todo` ↔ `in_progress` ↔ `done`.

### DELETE action
Allow both creator and assignee (for declining) appropriate access.

## Frontend Changes

### TasksPage.tsx
- Add third tab: **Team Tasks** (visible only to leads/executives/HR)
- Update status filter chips to include new statuses
- Pass `userRole` context to components for conditional UI

### TaskCard.tsx — complete rework
- Show `task_type` badge (Personal vs Assigned)
- Show all new statuses with appropriate colors
- **Assignee view**: Show Accept/Decline buttons for `pending_accept`; Submit button for `in_progress`
- **Lead/creator view**: Show Approve/Reject buttons for `submitted` tasks
- Display `challenges`, `estimated_duration`, `actual_duration`, `feedback`, `decline_reason` when present
- Due date now includes time (datetime picker)

### AddTaskDialog.tsx
- Add `estimated_duration` field
- Add datetime picker for due date (date + time)
- Filter "Assign To" dropdown based on role:
  - Global assigners see all users
  - Leads see only their team members
  - Employees see the field disabled/hidden

### New: TaskDetailSheet.tsx
A slide-out sheet for viewing full task details including:
- Full description, challenges, feedback history
- Status timeline
- Accept/Decline/Submit/Approve/Reject action buttons contextually

### New: AcceptDeclineDialog.tsx
Modal for assignee to accept or decline with optional/required reason.

### New: SubmitTaskDialog.tsx
Modal for assignee to submit work — includes challenges field and actual duration.

### New: ReviewTaskDialog.tsx
Modal for lead to approve or reject — includes feedback field.

## Hook Changes (`useTasks.ts`)

- Add `useTeamTasks()` for the team tab
- Add `useAssignableUsers()` hook that returns filtered user list based on current user's role and team
- Update mutation payloads to support new fields

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Add columns to tasks table |
| `supabase/functions/tasks/index.ts` | Major rewrite — permissions, status flow |
| `src/pages/TasksPage.tsx` | Add team tab, new statuses, role-aware UI |
| `src/components/tasks/TaskCard.tsx` | Rework for new statuses + action buttons |
| `src/components/tasks/AddTaskDialog.tsx` | Duration, datetime, filtered assignees |
| `src/components/tasks/TaskDetailSheet.tsx` | Create — full task detail view |
| `src/components/tasks/AcceptDeclineDialog.tsx` | Create |
| `src/components/tasks/SubmitTaskDialog.tsx` | Create |
| `src/components/tasks/ReviewTaskDialog.tsx` | Create |
| `src/hooks/useTasks.ts` | Add team tab, new mutations, assignable users |


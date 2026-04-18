

User approved with 3 final guardrails. I'll lock these into the plan and present the final implementation blueprint, then stop (read-only mode — actual implementation happens after switching to default mode).

Guardrails to enforce:
1. Ticket comment redaction preserves audit trail (placeholder, not invisible)
2. Ticket attachment ops gated by `has_ticket_access` — not generic attachment policy alone
3. `get_visible_user_ids` enforces real hierarchy (Head Ops ≠ all company)

# Phase A — Final Implementation Blueprint (Locked)

## Hierarchy semantics (correction #3 locked)

`get_visible_user_ids(_user_id text)` returns the set of user_ids the caller may see. Resolution order:

| Caller role | Returns |
|---|---|
| `chairman` (CEO) | all active profile user_ids |
| `vice_president` | self + Head of Operations + everyone reachable down the ops branch (depts whose parent chain reaches a head reporting into VP) |
| `head_of_operations` | self + only members of departments under operations (depts where `head_user_id`'s `manager_user_id` chain ≤ the caller, OR `departments.parent_department_id` traces to ops). NOT full company. |
| `team_development_lead`, `technical_lead`, `head_of_accounting`, `head_of_marketing`, `sales_lead` | self + members of their own department + direct reports (`manager_user_id = caller`) |
| All other roles | self only |

To support this without overreach, the migration adds `departments.parent_department_id uuid NULL` so the ops branch is structurally walkable (recursive CTE). VP/Head Ops scope is computed from that tree, not hard-coded role lists.

## Database migration (single file)

**Hierarchy**
- `profiles`: add `manager_user_id text NULL`, `department_id uuid NULL`
- New `departments` (`id`, `name unique`, `head_user_id text NULL`, `parent_department_id uuid NULL self-ref`, timestamps)

**Tickets domain**
- Enums: `ticket_type_enum`, `ticket_status_enum (open, in_progress, waiting, resolved, closed, archived)`, `ticket_priority_enum (low, medium, high, urgent)`, `ticket_source_enum`
- `tickets` — full schema; **no `deleted_at`** (use status `archived`)
- `ticket_comments` (`id`, `ticket_id`, `author_id`, `content`, `is_redacted boolean default false`, `redacted_by text NULL`, `redacted_at timestamptz NULL`, `redaction_reason text NULL`, `created_at`, `updated_at`)
  → Guardrail #1: no `deleted_at`. UI/API renders `is_redacted=true` rows as `"[comment removed by {actor} on {date}]"`. Original content preserved server-side for audit but never returned to clients.
- `ticket_activities` (`id`, `ticket_id`, `actor_id`, `activity_type`, `title`, `changes jsonb`, `metadata jsonb`, `created_at`)
- Ticket attachments → reuse `attachments` with `entity_type='ticket'` (no new table)

**Tasks extension**
- Add `account_id uuid NULL`, `ticket_id uuid NULL`, `progress_percent int default 0 check (0..100)`, `visible_scope text default 'private' check (private|department|management_chain)`

**Indexes**
- `tickets(account_id)`, `tickets(assigned_to)`, `tickets(technical_owner_id)`, `tickets(ticket_type, status)`, `tickets(status, updated_at desc)`
- `ticket_comments(ticket_id, created_at)`, `ticket_activities(ticket_id, created_at)`
- `tasks(account_id)`, `tasks(ticket_id)`, `tasks(assigned_to, status)`
- `profiles(department_id)`, `profiles(manager_user_id)`, `departments(parent_department_id)`

**RBAC SQL helpers (domain-specific — correction #2)**
- `get_visible_user_ids(_user_id)` — recursive CTE walking `departments.parent_department_id` + `profiles.manager_user_id`; returns rows per the matrix above
- `has_ticket_access(_user_id, _ticket_id) returns boolean` — true if creator / assignee / technical_owner / in caller's `get_visible_user_ids` set, or admin/exec
- `has_task_access(_user_id, _task_id) returns boolean` — analogous; respects `visible_scope`
- `has_leads_access_scoped` stays untouched and unused for tickets/tasks

**RLS**
- `tickets`, `ticket_comments`, `ticket_activities`: SELECT = `has_ticket_access(jwt_sub, id/ticket_id)`; ALL = service_role
- `departments`: SELECT to authenticated; ALL = service_role
- `profiles` UPDATE policy unchanged (service_role for manager/department changes)

**State machine (correction #6 locked)**
```
open ──> in_progress ⇄ waiting
  │            │
  └────────────┴──> resolved ──> closed ──> archived
                       ▲           │
                       └───reopen──┘
```
- Allowed transitions enforced server-side by an `assert_ticket_transition(old, new)` check; unauthorized transitions → 422
- Reopen (`resolved|closed → in_progress`): assignee, technical_owner, or admin only
- Un-archive: admin only

## Edge functions

### `tickets/index.ts` (new)
Actions, all RBAC-gated server-side, all writes audit-logged + activity-logged:
- `list` — paginated (page, page_size ≤100), filters: status[], type[], priority[], account_id, assigned_to, technical_owner_id, source[], date range, search; scoped via `has_ticket_access`/`get_visible_user_ids`
- `get`, `create`, `update`
- **Contact↔account validation (correction #4)**: when both `contact_id` and `account_id` present, server queries `contacts` to confirm `contact.account_id = account_id`; mismatch → 422 before any write
- `change_status` — runs state machine assertion
- `assign`, `set_technical_owner`, `archive`, `unarchive`
- `add_comment`, `list_comments` (returns redacted placeholder, never original content for redacted rows), `redact_comment` (author or admin; sets is_redacted+redacted_by+at+reason; emits `comment_redacted` activity row preserving comment_id)
- `list_activity`

### `tasks/index.ts` (extend existing)
- Carry `account_id`, `ticket_id`, `progress_percent`, `visible_scope` through `create`/`update`; validate progress 0..100; validate ticket_id exists & accessible
- `create_from_ticket` — copies title/description hint, links via `ticket_id` + ticket's `account_id`, default `visible_scope='department'`
- `list_management` — paginated, scoped via `get_visible_user_ids`, filters: user, department, status[], priority[], account, date range, search

### `attachments/index.ts` (extend) — Guardrail #2
- Whitelist `entity_type='ticket'`
- On `upload`/`download_url`/`delete` for ticket attachments: explicitly call `has_ticket_access(jwt_sub, entity_id)`; deny if false. Do not rely on the generic attachment SELECT policy alone.
- All three ops emit `audit_logs` entries

## Frontend (scope-disciplined per correction #7 — list/detail first, no kanban)

**New hooks**
- `src/hooks/useTickets.ts`, `useTicketComments.ts`, `useTicketActivity.ts`, `useAllTasks.ts`, `useDepartments.ts`

**New pages**
- `src/pages/TicketsPage.tsx` — table list + `TicketsFilterBar` + pagination controls (server-side)
- `src/pages/AllTasksPage.tsx` — server-paginated management view; route gated by role (Head Ops / VP / CEO / admins)

**New components (`src/components/tickets/`)**
- `AddTicketDialog.tsx` — form with contact↔account guard at form layer (disable contact picker until account chosen, filter contacts by selected account); server re-validates
- `TicketDetailSheet.tsx` — tabs: Details, Comments, Activity, Attachments, Linked Tasks (with "Create Task from Ticket")
- `TicketsFilterBar.tsx`, `TicketStatusBadge.tsx`, `TicketStatusDropdown.tsx` (only renders allowed next states based on current status)
- `TicketCommentItem.tsx` — renders redacted comments as `[Comment removed by {name} · {date}]` with original author chip preserved (Guardrail #1)

**Edits**
- `src/pages/TasksPage.tsx` — add **Support tab** rendering filtered ticket list (`ticket_type IN support|maintenance|deployment|bug_fix|service_request`); "Add Support" button opens `AddTicketDialog` with `ticket_type='support'` pre-selected. No new module.
- `src/components/tasks/TaskDetailSheet.tsx` — show linked ticket + account chips when present
- `src/components/layout/AppSidebar.tsx` — add "Tickets" + "All Tasks" entries with role gating
- `src/pages/AdminConsolePage.tsx` — small section: assign `manager_user_id` / `department_id` on profiles + manage `departments` (name, head, parent)
- `src/App.tsx` — register new routes

## Security & validation commitments (final)
- All inputs: Zod-validated in edge functions; oversize/unknown actions → 400
- Contact↔account integrity: client + server (correction #4)
- State machine + reopen/unarchive role checks server-side (correction #6)
- Ticket attachment ops gated by `has_ticket_access` (Guardrail #2)
- Comment redaction preserves placeholder + audit row (Guardrail #1)
- `get_visible_user_ids` reflects real hierarchy via dept tree, not blanket "all" (Guardrail #3)
- `audit_logs` entries on: ticket create/update/assign/status-change/archive/unarchive, comment add/redact, attachment upload/download/delete, task create_from_ticket
- Pagination max 100 on every list; indexed columns above

## Non-goals for Phase A
- No `supports` table / module (Support tab = filtered tickets)
- No soft-delete on tickets
- No kanban drag-drop yet (deferred to Phase A.5 if requested after stability)
- No Calendar / Reminders / PDF export (Phases B & C)

## File impact
- 1 migration
- 1 new edge fn (`tickets`), 2 extended (`tasks`, `attachments`)
- ~13 frontend files (5 new components, 5 new hooks, 2 new pages, 3 edited pages, 1 sidebar/route edit)

After implementation I'll pause for your review before Phase B.


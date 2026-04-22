

# Three improvements: project visibility, multi-assignee tasks, and Quotations workflow

Three independent but related changes. All add to existing patterns — no rip-and-replace.

## 1. Project visibility — "auto-share to assignees"

**Problem today**: a Head of Department's project is only visible to people in the same department. If they assign a task to someone outside (e.g. VP creates a project, assigns task to Head of Dev), the assignee can't see the parent project.

**Fix**: every time a task is attached to a project (on `tasks.create`, `tasks.update`, and `tasks.attach_to_project`), also grant the assignee implicit access to that project. Implementation: a new lightweight table `project_members` (project_id, user_id) and an OR branch added to `has_project_access()`. Owner / department / cross-dept / executive rules stay; an extra "is the user listed in `project_members`?" check is added.

Backend wiring:
- `tasks` edge function — when `assigned_to` is set on a task that has a `project_id`, upsert `(project_id, assigned_to)` into `project_members`.
- `useProjects('mine')` already returns projects the caller can see, so once RLS permits it the project will appear in their TasksPage strip and AddTaskDialog dropdown automatically.

Files: 1 migration (table + helper update) + edits to `supabase/functions/tasks/index.ts`. No frontend changes required.

## 2. Multi-assignee tasks

**Today**: `tasks.assigned_to` is a single text column.

**Fix**: introduce `task_assignees (task_id, user_id, assigned_at, assigned_by)`. Keep `tasks.assigned_to` as the **primary** assignee for backward compatibility with every existing query, badge, RLS policy, and notification path. Multi-assignment becomes additive.

Backend (`supabase/functions/tasks/index.ts`):
- `create` accepts `assignees: string[]`. The first goes into `assigned_to` (primary, preserves all existing behavior); the rest go into `task_assignees` rows.
- `update` accepts `add_assignees` / `remove_assignees`.
- `list_*` actions union-include any task where the caller is in `task_assignees` (in addition to `assigned_to`/`created_by`).
- Notifications fan out to every assignee on create / status change / due-date events using the existing `broadcastNotification` helper.

Frontend:
- `AddTaskDialog.tsx` — replace the single Assign-to combobox with a multi-select. The combobox keeps the same `useAssignableUsers` data; checkmarks become multi-select with chips above the field. First selection becomes primary (visually marked).
- `TaskDetailSheet.tsx` — render an avatar stack of assignees with a "+" to add more (opens the same combobox).
- `TaskCard.tsx` — show a small avatar stack instead of one avatar when assignees > 1.
- `useTasks.ts` — `Task` gains `assignees: { user_id, display_name, avatar_url }[]`. Every list response is enriched server-side.

RLS stays the same; the `tasks` SELECT policy gets one extra OR clause: `EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = current_user)`.

Files: migration (`task_assignees` + RLS update) + tasks edge function + 4 frontend files.

## 3. Quotations workflow on Accounts → Accounting

**Flow**:
1. Executive (chairman / VP / head_of_sales / sales_lead) opens an Account → Solutions tab.
2. New per-row button "Send to accounting" and a header button "Send all to accounting".
3. Both open a small dialog: pick which solutions, optional note, optional total amount, currency. Submit creates a `quotations` row with `status = 'requested'`.
4. All accounting users (`head_of_accounting`, `accounting_employee`) get an in-app notification (existing `broadcastNotification` path: title "New quotation request", body "<requester> requested a quotation for <account>"). Click goes to `/quotations/:id`.
5. New page `/quotations` for accounting roles + executives:
   - Table with columns: Reference, Account, Requested by, Solutions count, Total, Currency, Status, Created, Updated.
   - Filters: status, requester, account, date range, search by account name / reference.
   - Actions per row: View detail sheet, Edit (accounting only), Soft-delete (accounting head only), Export selected to CSV, Export all (filtered) to CSV.
   - Detail sheet: full account snapshot, line-item table of `quotation_items` (service name, description, qty, unit_price, line_total), inline notes, status timeline, audit log.

### Data model

```
quotations
  id, reference (auto: Q-YYYY-NNNN), account_id, requested_by,
  status ('requested'|'in_review'|'sent'|'accepted'|'rejected'|'cancelled'),
  total_amount numeric, currency text default 'USD',
  notes text, sent_at, decided_at,
  created_at, updated_at, deleted_at

quotation_items
  id, quotation_id, account_service_id (nullable — snapshot if service later deleted),
  service_name, description, quantity int default 1,
  unit_price numeric, line_total numeric, sort_order

quotation_activities  (mirrors lead_activities pattern)
  id, quotation_id, actor_id, activity_type, title, changes jsonb, metadata jsonb, created_at
```

RLS: SELECT for the requester, the account owner, and any user with role `head_of_accounting`, `accounting_employee`, `chairman`, `vice_president`, `head_of_operations`. Writes via service role only.

### Backend

New edge function `supabase/functions/quotations/index.ts` — actions: `list` (with filters), `get`, `create` (executives + sales_lead), `update` (accounting), `update_status`, `add_item`, `update_item`, `remove_item`, `delete` (head_of_accounting only), `export_csv` (server-side CSV string).

`supabase/functions/accounts/index.ts` (existing) — gains `request_quotation` action which is just sugar for creating a quotation from chosen `account_services` rows.

### Frontend

- `src/components/accounts/AccountSolutionsPanel.tsx` — add row checkboxes (when caller is exec/sales_lead), per-row "Send to accounting" icon button, header "Send selected to accounting" button. Opens new `RequestQuotationDialog`.
- `src/components/accounts/RequestQuotationDialog.tsx` (new) — preselected items, optional note, currency, total override.
- `src/hooks/useQuotations.ts` (new) — `useQuotations(filters)`, `useQuotation(id)`, `useCreateQuotation`, `useUpdateQuotation`, `useUpdateQuotationStatus`, `useDeleteQuotation`.
- `src/pages/QuotationsPage.tsx` (new) — table + filters + export, mirrors `LeadsPage` structure.
- `src/components/quotations/QuotationsFilterBar.tsx`, `QuotationsTable.tsx`, `QuotationDetailSheet.tsx`, `QuotationItemRow.tsx` (new).
- `src/App.tsx` — `/quotations` and `/quotations/:id` routes, allowed roles: accounting + executive + sales lead.
- `src/config/navigation.ts` — new "Quotations" entry under Organization, allowed roles `head_of_accounting`, `accounting_employee`, `chairman`, `vice_president`, `head_of_operations`, `sales_lead`.
- Notification trigger: in the quotations function on `create`, fan out to every user with role `head_of_accounting` or `accounting_employee` using the existing notifications insert + Realtime broadcast pattern. Click-through `/quotations/:id` uses the `reference_id` / `reference_type = 'quotation'` notification metadata convention already in use.

### Out of scope

- PDF rendering of a quotation (CSV export only this round).
- Email delivery to the customer — internal workflow only; "sent" is a manual status flip by accounting.
- Approval chains beyond simple status flips.
- Editing solution prices on the Account itself (prices live on `quotation_items`; the account's `account_services` table stays metadata-only).

## File impact

```
Migration (1)
  add table       project_members
  add table       task_assignees
  add table       quotations
  add table       quotation_items
  add table       quotation_activities
  update fn       has_project_access  (+ project_members branch)
  update RLS      tasks               (+ task_assignees branch)
  RLS             new tables

Edge functions
  new   supabase/functions/quotations/index.ts
  edit  supabase/functions/tasks/index.ts          multi-assignee + project_members upsert
  edit  supabase/functions/projects/index.ts       include project_members in canSeeProject
  edit  supabase/functions/accounts/index.ts       request_quotation passthrough

Frontend
  new   src/hooks/useQuotations.ts
  new   src/pages/QuotationsPage.tsx
  new   src/components/quotations/QuotationsFilterBar.tsx
  new   src/components/quotations/QuotationsTable.tsx
  new   src/components/quotations/QuotationDetailSheet.tsx
  new   src/components/accounts/RequestQuotationDialog.tsx
  edit  src/components/accounts/AccountSolutionsPanel.tsx
  edit  src/components/tasks/AddTaskDialog.tsx        multi-select assignees
  edit  src/components/tasks/TaskDetailSheet.tsx      assignee stack + add more
  edit  src/components/tasks/TaskCard.tsx             avatar stack
  edit  src/hooks/useTasks.ts                         assignees array
  edit  src/App.tsx                                    /quotations route
  edit  src/config/navigation.ts                       Quotations nav entry
```


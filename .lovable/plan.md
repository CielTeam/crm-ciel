

# Finish the remaining frontend for multi-assignee tasks + Quotations

Backend is fully in place. This plan delivers only the frontend pieces that were not yet built.

## 1. Multi-assignee task UI

**`src/hooks/useTasks.ts`**
- Extend the `Task` type with `assignees: { user_id: string; display_name: string | null; avatar_url: string | null; role?: string | null; is_primary: boolean }[]`. The edge function already returns this.
- Add mutation hooks: `useAddTaskAssignees()` → calls `{ action: 'add_assignees', task_id, user_ids }`, and `useRemoveTaskAssignee()` → `{ action: 'remove_assignee', task_id, user_id }`. Both invalidate the same task query keys the existing reassignment flow uses.

**`src/components/tasks/AddTaskDialog.tsx`**
- Replace the single-select assignee combobox with a multi-select. Selected users render as chips above the field; the first selected is marked "Primary" with a small badge.
- `onSubmit` payload becomes `{ ..., assignees: string[] }` (drop `assigned_to`). The first chip is the primary; the edge function already handles this contract.
- Keep `useAssignableUsers` data and the same role/department filtering logic — only the selection model changes.

**`src/components/tasks/TaskCard.tsx`**
- Replace single avatar with an avatar stack: show up to 3 overlapping `Avatar`s (`-ml-2` overlap) and a `+N` chip when more. Tooltip on hover lists names. Falls back to single avatar when only one assignee.

**`src/components/tasks/TaskDetailSheet.tsx`**
- "Assigned to" section: render the same avatar stack with names beneath, primary marked. Add a `+ Add` button that opens an inline assignee multi-select popover (reuses the same combobox component used in `AddTaskDialog`). Each non-primary chip gets an `x` to remove.
- Wire to `useAddTaskAssignees` / `useRemoveTaskAssignee`.

## 2. Quotations frontend

**`src/hooks/useQuotations.ts` (new)** — wraps the `quotations` edge function:
- `useQuotations(filters)` — list with filters (status, requester, account, date range, search).
- `useQuotation(id)` — single quotation with items + activities.
- `useCreateQuotation()`, `useUpdateQuotation()`, `useUpdateQuotationStatus()`, `useDeleteQuotation()`.
- `useAddQuotationItem()`, `useUpdateQuotationItem()`, `useRemoveQuotationItem()`.
- `useExportQuotationsCsv(filters)` — calls `export_csv`, returns CSV string for download.

**`src/components/accounts/RequestQuotationDialog.tsx` (new)**
- Props: `accountId`, `preselectedServiceIds: string[]`, `open`, `onOpenChange`.
- Body: editable list of selected services (toggle off any), optional note (textarea), currency `Select` (USD/EUR/GBP/AED/SAR), optional `total_amount` override input.
- Submit → `accounts.request_quotation` action with `{ account_id, account_service_ids, currency, notes, total_amount }`. Toast on success, close.

**`src/components/accounts/AccountSolutionsPanel.tsx` (edit)**
- Show controls only when `currentUser.role` is in `['chairman','vice_president','head_of_sales','sales_lead']`.
- Per-row: `Checkbox` + small "Send to accounting" icon button (opens dialog with that one preselected).
- Header: bulk "Send selected to accounting" button (enabled when ≥1 row checked).

**`src/components/quotations/QuotationsFilterBar.tsx` (new)** — search input, status `Select`, requester combobox (uses `useDirectoryData`), account combobox (uses `useAccountsContacts`), date range picker, "Reset" button. Mirrors `LeadsFilterBar` patterns.

**`src/components/quotations/QuotationsTable.tsx` (new)** — columns: Reference, Account, Requested by (avatar + name), Items count, Total + currency, Status badge (color-coded), Created, Updated, Actions (View, Edit for accounting, Delete for `head_of_accounting`). Row click opens detail sheet. Selection checkboxes for bulk export.

**`src/components/quotations/QuotationDetailSheet.tsx` (new)** — header (reference, status badge, account name); editable status `Select` (accounting only); account snapshot card; line items table with inline qty/unit_price edits (accounting only) and add/remove rows; notes; activity timeline rendered from `quotation_activities`.

**`src/pages/QuotationsPage.tsx` (new)** — header (title, "Export CSV" button using current filters), `QuotationsFilterBar`, `QuotationsTable`, `QuotationDetailSheet` controlled by `selectedQuotationId` state. Mirrors `LeadsPage` structure.

**`src/App.tsx` (edit)** — add route:
```text
/quotations  →  ProtectedRoute allowedRoles=[
  'chairman','vice_president','head_of_operations',
  'head_of_accounting','accounting_employee','sales_lead'
]  →  QuotationsPage
```

**`src/config/navigation.ts` (edit)** — add under "Organization":
```text
{ title: 'Quotations', path: '/quotations', icon: FileText,
  allowedRoles: ['chairman','vice_president','head_of_operations',
                 'head_of_accounting','accounting_employee','sales_lead'] }
```

**Notification click-through** — `useNotifications` already routes by `reference_type`. Add the case `'quotation'` → `/quotations?open=<reference_id>`. `QuotationsPage` reads the `open` query param on mount and opens the detail sheet.

## File impact

```text
edit  src/hooks/useTasks.ts                              assignees type + add/remove hooks
edit  src/components/tasks/AddTaskDialog.tsx             multi-select assignees
edit  src/components/tasks/TaskCard.tsx                  avatar stack
edit  src/components/tasks/TaskDetailSheet.tsx           assignee stack + add/remove

new   src/hooks/useQuotations.ts
new   src/pages/QuotationsPage.tsx
new   src/components/quotations/QuotationsFilterBar.tsx
new   src/components/quotations/QuotationsTable.tsx
new   src/components/quotations/QuotationDetailSheet.tsx
new   src/components/accounts/RequestQuotationDialog.tsx
edit  src/components/accounts/AccountSolutionsPanel.tsx  selection + send-to-accounting buttons
edit  src/App.tsx                                         /quotations route
edit  src/config/navigation.ts                            Quotations nav entry
edit  src/hooks/useNotifications.ts                       quotation click-through
```

No backend, migration, or edge-function changes — backend is already done from the previous steps.


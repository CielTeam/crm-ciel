

# Two fixes: project department targeting + Send-to-accounting bug

## 1. Bug fix — "Send to accounting" returns 400

**Root cause**: parameter name mismatch between client and server.
- The dialog (`RequestQuotationDialog` → `useRequestQuotationFromAccount`) sends `account_service_ids`.
- The `accounts` edge function `request_quotation` action reads `service_ids` and rejects with `"At least one service_id required"`.

**Fix**: rename the field on the server side to `account_service_ids` (matches the client and is more descriptive). This is the smaller, lower-risk side of the contract to change.

- `supabase/functions/accounts/index.ts` — in the `request_quotation` block:
  - Destructure `account_service_ids` instead of `service_ids`.
  - Use it in the `.in('id', account_service_ids)` query.
  - Update the validation error message accordingly.

No DB / no client changes needed for this fix.

## 2. Feature — executives pick one, many, or all departments per project

Backend already supports this end-to-end (`shared_departments` is accepted by the `projects.create` action and `project_departments` is checked during scope resolution). Only the UI is missing.

**`src/components/projects/CreateProjectDialog.tsx`** — for executives only (`chairman`, `vice_president`, `head_of_sales`):

- Replace the single `Select` for Department with a new "Visibility" section that has:
  - A radio/segmented choice: **Single department** | **Multiple departments** | **All departments**.
  - **Single**: existing `Select` (current behavior). Submits `department: <picked>`.
  - **Multiple**: a checkbox list of `DEPARTMENTS`. The first checked becomes the primary `department`; the remaining are sent as `shared_departments`. Validation: at least one must be checked.
  - **All**: no picker; on submit, send `department: <first dept>` + `shared_departments: <all other depts>` so every department sees the project.
- Non-execs keep today's behavior (single department, locked to their own when `defaultDepartment` is set). The new visibility selector is hidden for them.
- Submit payload extension: pass `shared_departments?: string[]` through `useCreateProject` (the hook already accepts it).
- Small UX polish: helper text under the visibility selector explaining who will see the project ("Visible to: Sales, HR, Dev…").

**Which roles count as "executive" here**
Reuse the same logic that gates other exec-only project actions: `chairman`, `vice_president`, `head_of_sales` (the head of sales was called out in the original plan as an executive project creator). `head_of_operations` and other heads keep single-department creation for their own department.

## File impact

```text
edit  supabase/functions/accounts/index.ts                  rename service_ids → account_service_ids in request_quotation
edit  src/components/projects/CreateProjectDialog.tsx       multi/all-department visibility selector for executives
```

No DB migration. No edge-function deletion. No new files.


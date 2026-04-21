

# Projects for Tasks: department-scoped, draggable, with analytics

A new "Project" concept groups tasks. Department leads create projects, assign tasks to them, and see per-project analytics. Executives see a tree of departments → projects → tasks. Tasks created from leads or accounts skip project assignment and can be moved into a project later.

## 1. Data model — new tables

### `projects`
```
id uuid pk
name text not null
description text
status text not null default 'active'        -- active | on_hold | completed | archived
color text                                    -- hex tag color
department text                               -- one of DEPARTMENTS, null = personal
is_personal boolean not null default false    -- personal projects: owner-only
target_end_date date                          -- lead's planned finish
owner_user_id text not null                   -- creator/lead
created_by text not null
created_at, updated_at, deleted_at timestamptz
```

### `project_departments` (cross-department sharing)
```
project_id uuid not null
department text not null
primary key (project_id, department)
```
Used when a project spans more than one department (e.g. development + technical). For single-department projects, the `projects.department` column is enough; the table holds *additional* shared departments.

### `tasks` — additive columns (one migration)
```
project_id uuid           -- nullable; required only when assigned_to is set + scope = department
project_sort_order int default 0   -- per-project drag order
```
Index on `(project_id, project_sort_order)`.

### RLS (mirrors `tasks` patterns)

- `projects` — authenticated SELECT when:
  - `is_personal = true AND owner_user_id = auth0_sub`, OR
  - executive role (chairman, vice_president, head_of_operations, technical_lead, team_development_lead), OR
  - caller is in `projects.department` or any row in `project_departments` for this project (resolved through `profiles.department_id` → department name mapping via a small `SECURITY DEFINER` helper `user_in_department(_user, _dept_name)`).
- `project_departments` — readable when caller can read the parent project.
- All writes via service role through the edge function.

## 2. Edge function changes

### `supabase/functions/projects/index.ts` (new)
Actions, all auth via existing Auth0 JWT helper:

- `list { scope?: 'mine' | 'department' | 'all', department?, include_personal? }`
  - `mine`: projects the caller owns or is in (default for assignment dropdowns)
  - `department`: projects in caller's department(s) — used by leads
  - `all`: executives only — returns every project, grouped by department
- `create { name, description?, department?, is_personal?, color?, target_end_date?, shared_departments?: string[] }`
  - Authorization: leads/executives can create department projects in their own department(s); anyone can create personal (`is_personal = true, department = null`).
- `update { id, ... }` — owner / lead of department / executive only.
- `archive { id }` / `restore { id }` — soft delete.
- `analytics { id }` — returns: total tasks, open / in_progress / done / overdue counts, completion %, sum of remaining `estimated_duration` in minutes, target_end_date, on-track flag (`days_remaining vs avg_velocity * open_count`).
- `analytics_summary { department? }` — for the lead dashboard: per-project rollup as above for every project the caller can see.
- `reorder_tasks { project_id, task_ids: string[] }` — bulk update `project_sort_order`.

### `supabase/functions/tasks/index.ts` (extend)

- `create` / `update` payload accepts `project_id`. Validation:
  - If `project_id` is provided, verify caller can see that project.
  - **Required when** `assigned_to` is set AND request is not `lead_id`/`account_id`-originated AND assignee belongs to a department. Lead-originated and account-originated tasks may omit project (matches your spec); attaching later is allowed via `update`.
- New action `attach_to_project { task_id, project_id | null, create_personal_project_name? }` — special path used from the task detail sheet's "Add to project" button. If `create_personal_project_name` is given, creates a personal project first, then attaches.
- `list_management` — group results by project when caller is executive/chairman/VP/head_of_sales (used by the All Tasks page tree view).

## 3. Frontend changes

### Hooks — `src/hooks/useProjects.ts` (new)
`useProjects(scope)`, `useProjectAnalytics(id)`, `useProjectsAnalyticsSummary(department?)`, `useCreateProject`, `useUpdateProject`, `useArchiveProject`, `useAttachTaskToProject`, `useReorderProjectTasks`.

### `useTasks.ts` — extend `Task` and `useCreateTask` payload with `project_id`. Add `useTasksByProject(projectId)`.

### Task creation UX — `AddTaskDialog.tsx`
- New required field "Project" (a `Combobox` listing the caller's accessible projects + an inline "Create new project…" CTA that opens `CreateProjectDialog`).
- Required only when `assigned_to` is set (department task). For unassigned/personal it stays optional.
- Lead-originated dialog (called from `LeadTasksPanel`) and account-originated (new `AccountTasksPanel`) inject `lead_id`/`account_id` and **hide** the Project field.

### Task detail — `TaskDetailSheet.tsx`
- Show current project as a chip near title (color from `projects.color`).
- "Add to project" button when `project_id` is null → opens `AttachToProjectDialog`:
  - Tabs: "Existing project" (combobox of accessible projects) / "New personal project" (name + create).
- Move to a different project supported the same way.

### New components
- `src/components/projects/CreateProjectDialog.tsx`
- `src/components/projects/AttachToProjectDialog.tsx`
- `src/components/projects/ProjectCard.tsx` — title, status pill, completion bar, counts, target date / on-track badge.
- `src/components/projects/ProjectAnalyticsCard.tsx` — used in the lead dashboard.
- `src/components/projects/ProjectTasksBoard.tsx` — DnD-kit sortable list of tasks inside one project.

### Lead dashboard — `src/pages/ProjectsPage.tsx` (new) + nav entry
- Visible to anyone with a department (everyone). Shows projects scoped to the caller.
- Toggle: My Projects / Department Projects.
- Grid of `ProjectCard`s with create button.
- Click a project → `ProjectDetailSheet` with tabs: Overview (analytics), Tasks (drag-and-drop board), Members (read-only list), Settings.

### Executive view — extend `AllTasksPage.tsx`
- New "Group by" toggle: Flat (today) / By Department → Project.
- Tree: Department > Project (collapsible) > Tasks table. Roles `chairman`, `vice_president`, `head_of_operations`, `head_of_marketing`, `head_of_accounting`, `sales_lead` see all departments; department leads see only theirs.
- Reuses `analytics_summary` for the per-project stat header inside each tree node.

### Drag-and-drop tasks within a project
- `ProjectTasksBoard` uses existing `@dnd-kit/sortable` (already in deps).
- On drop, calls `useReorderProjectTasks` → `reorder_tasks` action. Same pattern already used by `useReorderTasks` in `useTasks.ts`.

### Account tasks — `src/components/accounts/AccountTasksPanel.tsx` (new)
- Mirrors `LeadTasksPanel` exactly. Lists `tasks` where `account_id = current_account.id` via a new `list_by_account` action in the tasks function.
- "Add task" opens `AddTaskDialog` with `account_id` injected and the Project field hidden (same lead behavior).
- Wire all action dialogs (Accept/Decline/Submit/Approve/Reject) — uses the same pattern that was just fixed for `LeadTasksPanel`.
- Mounted in `AccountDetailSheet.tsx` as a new "Tasks" tab between "Solutions" and "Notes".

## 4. Notifications & activity

- Project create / archive / task-attached events insert into `audit_logs` (no per-user notification spam).
- Task `attach_to_project` adds a `task_activity_logs` entry: "Moved to project: {name}" — surfaces in the existing task detail Activity tab.

## 5. File impact

```
Database (1 migration)
  create projects
  create project_departments
  add tasks.project_id, tasks.project_sort_order (+ index)
  create user_in_department helper + RLS policies

Backend
  supabase/functions/projects/index.ts            NEW
  supabase/functions/tasks/index.ts               extend create/update + attach_to_project + list_by_account + grouped list_management

Frontend (≈12 files, 7 new)
  src/hooks/useProjects.ts                        NEW
  src/hooks/useTasks.ts                           project_id field + useTasksByProject + useTasksByAccount
  src/components/tasks/AddTaskDialog.tsx          Project combobox (conditional)
  src/components/tasks/TaskDetailSheet.tsx        project chip + "Add to project" button
  src/components/projects/CreateProjectDialog.tsx        NEW
  src/components/projects/AttachToProjectDialog.tsx      NEW
  src/components/projects/ProjectCard.tsx                NEW
  src/components/projects/ProjectAnalyticsCard.tsx       NEW
  src/components/projects/ProjectTasksBoard.tsx          NEW
  src/components/projects/ProjectDetailSheet.tsx         NEW
  src/components/accounts/AccountTasksPanel.tsx          NEW
  src/components/accounts/AccountDetailSheet.tsx  add Tasks tab
  src/components/leads/LeadTasksPanel.tsx         hide project field on add (props change to AddTaskDialog)
  src/pages/ProjectsPage.tsx                              NEW
  src/pages/AllTasksPage.tsx                      add "Group by Department/Project" tree mode
  src/App.tsx + src/config/navigation.ts          Projects route + sidebar entry
```

## 6. Out of scope (callouts)

- Project member invites (no per-project ACL; visibility is department + cross-department + executive).
- Cross-project drag-and-drop (drag is within a single project's task list).
- Auto-rolling project status (manual transitions only — `active` → `completed` etc.).
- Email digests for project completion (in-app activity log only).


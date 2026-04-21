

# Move Projects into the Tasks page (no separate Projects page)

Replace the standalone Projects page with an inline "Projects" strip inside `TasksPage`. Each project is a card; clicking it drills into a project view that uses the same task list/board UI you already have. Tasks without a project sit in an "Unassigned" section below the strip. Drag-and-drop reordering works in both contexts.

## 1. Remove the separate Projects page

- Delete the sidebar entry "Projects" from `src/config/navigation.ts`.
- Remove the `/projects` route from `src/App.tsx`.
- Delete `src/pages/ProjectsPage.tsx`.

(The project hooks, dialogs, edge function, and `ProjectCard` stay — they're reused inside Tasks.)

## 2. New layout inside `src/pages/TasksPage.tsx`

Order, top to bottom (only on the four task tabs — `my_tasks`, `assigned`, `assigned_by_me`, `team_tasks`; the `support` tab is unchanged):

```text
[ Header: Tasks                                  + New Task ]
[ Search bar ]
[ Tabs: My / Assigned / Assigned by Me / Team / Support ]
[ Status chips ] [ Priority + Sort controls ]

— when no project is selected —
┌─ Projects ──────────────────────────  + New Project ─┐
│ [ProjectCard] [ProjectCard] [ProjectCard] [+ Create] │
└──────────────────────────────────────────────────────┘
┌─ Unassigned tasks ───────────────────────────────────┐
│ <existing TaskCard list / TaskBoardView, draggable> │
└──────────────────────────────────────────────────────┘

— when a project IS selected —
[ ← Back to all  •  ● Project name  •  status badge  •  edit ]
[ inline analytics row: total / active / done / overdue / % / target date ]
[ <existing TaskCard list / TaskBoardView for this project, draggable> ]
```

State: a single `selectedProjectId: string | null` in `TasksPage`. `null` → strip + unassigned. Set → drill-in view.

## 3. Project strip

- Horizontally scrollable row (`flex gap-3 overflow-x-auto`) of `ProjectCard` (existing component) plus a trailing dashed "Create project" tile that opens `CreateProjectDialog`.
- Data: `useProjectsAnalyticsSummary(scope)` where `scope` is derived from the active task tab:
  - `my_tasks` / `assigned` → `'mine'`
  - `assigned_by_me` / `team_tasks` → `'department'`
- Each card's `onClick` sets `selectedProjectId = project.id`.

## 4. Unassigned section (no project)

- Filter the already-fetched `tasks` list by `t.project_id == null`, then run the existing search/status/priority/sort pipeline on that subset. The current `filtered` memo gets a `projectId` argument or splits into `unassignedFiltered`.
- Reuses the existing `TaskCard` / `TaskBoardView` rendering — no UI duplication.

## 5. Project drill-in

- Header: back arrow → clears `selectedProjectId`; project color dot + name; status badge; `useProjectAnalytics(selectedProjectId)` populates a one-line stat strip (Total · Active · Done · Overdue · Completion % · Target date · On-track chip).
- Task list: `useTasksByProject(selectedProjectId)` (already exists). Same filter/sort controls and same `TaskCard` / `TaskBoardView` rendering used everywhere else.
- All existing handlers (`handleStatusChange`, `handleMarkDone`, `handleMarkUndone`, `handleTogglePin`, `handleDelete`, `setSelectedTask` for the detail sheet, sheet-action dialogs) work unchanged because they operate by task `id`.

## 6. Drag-and-drop reordering

Both the unassigned list and a project's list become sortable using `@dnd-kit/sortable` (already installed):

- New small wrapper `SortableTaskList` in `src/components/tasks/SortableTaskList.tsx` that wraps the rendered `TaskCard`s in a `SortableContext` + `useSortable`. Only active when:
  - `viewMode === 'list'`
  - `sortField === 'created_at'` is replaced with manual order — i.e. drag is enabled when the user picks a new sort option **"Manual"**, OR drag is always enabled in the project drill-in (server stores `project_sort_order`) and in unassigned (uses existing `tasks.sort_order` via `useReorderTasks`).
- On drop:
  - Project context → `useReorderProjectTasks({ project_id, task_ids })` (already exists).
  - Unassigned context → `useReorderTasks(task_ids)` (already exists in `useTasks.ts`).
- Board view (`TaskBoardView`) is left as-is — DnD only applies in list view.

## 7. Files touched

```text
edit   src/pages/TasksPage.tsx              add project strip, drill-in view, unassigned section, DnD wiring
new    src/components/tasks/SortableTaskList.tsx   dnd-kit wrapper around TaskCard list
edit   src/config/navigation.ts             remove Projects nav entry
edit   src/App.tsx                          remove /projects route
delete src/pages/ProjectsPage.tsx
```

No backend, hook, or migration changes — everything (`useProjectsAnalyticsSummary`, `useTasksByProject`, `useProjectAnalytics`, `useReorderProjectTasks`, `useReorderTasks`, `attach_to_project`, project create/update) is already in place from the previous step.

## 8. Out of scope

- Changing the project creation flow (still uses `CreateProjectDialog`).
- Changing how tasks get attached to projects from `TaskDetailSheet` (the existing "Add to project" button stays).
- Cross-project drag (drag stays inside a single list, matching prior plan).
- Executive "Department → Project" tree on `AllTasksPage` — that remains as previously planned and is not affected by this restructure.


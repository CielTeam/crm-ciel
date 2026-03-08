

# Build: Tasks Page with Full Functionality

## Overview

Create a comprehensive Tasks page with personal to-dos, assigned tasks, status tracking, deadlines, and priority levels.

## Database Design

**New `tasks` table:**
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo', -- todo, in_progress, done
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
  due_date TIMESTAMPTZ,
  created_by TEXT NOT NULL, -- Auth0 user_id
  assigned_to TEXT, -- Auth0 user_id (nullable for personal tasks)
  team_id UUID REFERENCES teams(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS Policies:**
- Users can read tasks they created or are assigned to
- Users can update/delete their own tasks
- Service role has full access for edge functions

## Backend: Edge Function

**`supabase/functions/tasks/index.ts`** — CRUD operations:
- `GET` — List tasks for current user (created by or assigned to)
- `POST` — Create new task
- `PUT` — Update task (status, details)
- `DELETE` — Delete task

Uses service role, validates actor_id against Auth0 user.

## Frontend Components

**`src/hooks/useTasks.ts`:**
- `useTasks()` — Query tasks for current user
- `useCreateTask()` — Mutation to create
- `useUpdateTask()` — Mutation to update status/details
- `useDeleteTask()` — Mutation to delete

**`src/pages/TasksPage.tsx`:**
- Tabs: "My Tasks" / "Assigned to Me"
- Filters by status (All, To Do, In Progress, Done)
- Priority badges (color-coded)
- Due date display with overdue highlighting
- Add Task dialog
- Task cards with edit/delete actions

**`src/components/tasks/TaskCard.tsx`:**
- Title, description preview, priority badge
- Status dropdown to change status inline
- Due date with overdue indicator
- Assigned user avatar (if assigned)

**`src/components/tasks/AddTaskDialog.tsx`:**
- Form: title, description, priority, due date, assignee (optional)

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/...` | Create tasks table |
| `supabase/functions/tasks/index.ts` | CRUD edge function |
| `supabase/config.toml` | Add tasks function config |
| `src/hooks/useTasks.ts` | React Query hooks |
| `src/pages/TasksPage.tsx` | Replace placeholder |
| `src/components/tasks/TaskCard.tsx` | Task display component |
| `src/components/tasks/AddTaskDialog.tsx` | Create task form |


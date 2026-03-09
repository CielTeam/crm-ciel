

# Notifications Module

## Overview
Build a full notifications system that creates notifications for leave approvals/rejections, task assignments, and new messages. Users see a notification list page and an unread badge in the sidebar.

## 1. Database

**`notifications` table:**
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'leave_approved', 'leave_rejected', 'task_assigned', 'new_message'
  title TEXT NOT NULL,
  body TEXT,
  reference_id TEXT,            -- ID of the related entity (leave, task, conversation)
  reference_type TEXT,          -- 'leave', 'task', 'conversation'
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

RLS: Users can SELECT own notifications; service role manages all.

## 2. Backend: Edge Function `supabase/functions/notifications/index.ts`

Actions:
- **list** — User's notifications (unread first, paginated)
- **mark_read** — Mark one or all as read
- **unread_count** — Return count of unread notifications
- **create** — Internal action (called by other edge functions) to insert a notification

## 3. Notification Triggers (modify existing edge functions)

- **`leaves/index.ts`** — On `review` action (approve/reject), call notifications `create` for the leave owner
- **`tasks/index.ts`** — On `create`/`update` when `assigned_to` is set/changed, notify the assignee
- **`messages/index.ts`** — On `send_message`, notify all conversation members except the sender

Notifications are created by inserting directly via the service-role Supabase client within each edge function (no cross-function invocation needed).

## 4. Frontend

| File | Purpose |
|------|---------|
| `src/hooks/useNotifications.ts` | `useNotifications()`, `useUnreadCount()`, `useMarkRead()` hooks |
| `src/pages/NotificationsPage.tsx` | Full notification list with read/unread filtering, mark-all-read button |
| `src/components/layout/AppSidebar.tsx` | Add unread badge next to Notifications nav item |

## 5. Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/...` | Create `notifications` table with RLS |
| `supabase/functions/notifications/index.ts` | New edge function |
| `supabase/functions/leaves/index.ts` | Add notification insert on review |
| `supabase/functions/tasks/index.ts` | Add notification insert on assign |
| `supabase/functions/messages/index.ts` | Add notification insert on send |
| `supabase/config.toml` | Register notifications function |
| `src/hooks/useNotifications.ts` | New hooks |
| `src/pages/NotificationsPage.tsx` | Replace placeholder |
| `src/components/layout/AppSidebar.tsx` | Unread badge |


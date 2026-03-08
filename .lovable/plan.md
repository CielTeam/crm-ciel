

# CIEL Internal CRM — Phased Build Plan

## Overview

This is a large enterprise CRM with 16+ roles, role-based dashboards, Auth0 Passkey authentication, and deep module integration (calendar, meetings, tasks, leaves, messages, notifications, audit). We will build it in 6 phases, each delivering a working increment.

Since integrations (Google Calendar, Resend, reCAPTCHA) are not ready yet, those modules will be built with placeholder/mock integration points that can be connected later.

---

## Phase 1 — Foundation (Auth + Roles + Dashboard Shell)

**Goal:** Login screen, Auth0 integration, role resolution, role-based dashboard shell with sidebar navigation.

- **Auth0 Passkey login page** — single entry point, branded CIEL login screen. Auth0 SDK handles WebAuthn. After login, fetch user role from Supabase `user_roles` table and redirect to role dashboard.
- **Supabase schema (external project):**
  - `profiles` table (user_id FK to auth.users, display_name, email, avatar_url, team, working_hours JSONB, status, created_at, deleted_at)
  - `user_roles` table with `app_role` enum for all 16 roles
  - `teams` table (id, name, lead_user_id)
  - `team_members` table (team_id, user_id)
  - `audit_logs` table (id, actor_id, action, target_type, target_id, metadata JSONB, created_at)
  - RLS policies + `has_role()` security definer function
- **Dashboard layout** — `SidebarProvider` shell with:
  - Top bar (logo, notification badge, profile menu)
  - Role-aware sidebar (nav items filtered by permission)
  - Content area with nested routes
- **Role-based routing** — protected route wrapper checking permissions; 16 role dashboards each with their authorized page set
- **Stub pages** for all global modules (Home, Calendar, Tasks, Leaves, Messages, Meetings, Notifications, Directory, Profile/Settings) — placeholder content, wired into navigation

---

## Phase 2 — User Administration & Audit

**Goal:** Technical Lead + Team Dev Lead can manage users, roles, teams. All actions audit-logged.

- **Admin console pages:** User list, create/edit user form, role assignment, suspend/soft-delete/hard-delete with confirmation + justification
- **Team management:** Create teams, assign leads, add/remove members
- **Audit log explorer:** Filterable table (actor, action, target, date range), export to CSV
- **Audit logging:** Edge function or DB triggers to write audit entries for all admin actions

---

## Phase 3 — Tasks & Leaves

**Goal:** Full task lifecycle and leave request system.

- **Tasks module:**
  - Personal to-do (CRUD, priority, due date, tags, checklist)
  - Assigned tasks with full status flow (pending_accept → accepted → in_progress → submitted → approved/rejected → done)
  - Lead views: assign to team, bulk assign, templates, approval queue
  - Comments thread, attachments placeholder
  - Escalation rules (overdue → notify lead → notify VP for critical)
  - Task reporting (cycle time, overdue counts, workload)
- **Leaves module:**
  - Submit leave request (type, dates, reason, attachment)
  - Approval routing (lead → HR oversight)
  - Coverage warnings (team overlap detection)
  - Leave calendar integration (approved leaves show as busy)
  - Leave reporting (utilization, patterns)
- **Supabase tables:** `tasks`, `task_comments`, `task_templates`, `task_events`, `leave_requests`, `leave_events`

---

## Phase 4 — Calendar & Meetings

**Goal:** Calendar for all users, meeting scheduling with availability enforcement.

- **Calendar module:**
  - Day/Week/Month views (using a React calendar library)
  - Display meetings, approved leaves, manual blocks, task due dates
  - Manual block CRUD (focus/OOO/travel/busy) with visibility settings
  - Working hours configuration per user
  - Lead view: team availability heatmap
- **Meetings module:**
  - Meeting request form (participants, title, agenda)
  - Availability check against internal data (meetings + blocks + leaves)
  - Time slot suggestions (3+ options)
  - Accept/decline/tentative flow
  - Meeting list (upcoming, past, cancelled), detail view
  - Placeholder for Google Calendar FreeBusy and Meet link generation (activated when API keys are provided)
- **Supabase tables:** `calendar_blocks`, `meetings`, `meeting_participants`, `meeting_events`

---

## Phase 5 — Messages, Notifications & Announcements

**Goal:** Internal messaging, notification system with badge counts, announcements.

- **Messages:**
  - Direct and group conversations
  - Threaded messages with timestamps
  - @mentions, unread markers, search
  - Supabase Realtime for live updates
- **Notifications:**
  - In-app notification center (bell icon + badge count)
  - Browser tab title with unread count `(N)`
  - Filter by type, mark read/all read
  - Generated from task/leave/meeting/message events
  - Email delivery placeholder (Resend integration point)
- **Announcements:**
  - Company-wide (Chairman/VP), team-level (leads), HR policy
  - Targeting by role/team, mandatory read acknowledgment, expiration
- **Supabase tables:** `conversations`, `messages`, `notifications`, `announcements`, `announcement_reads`

---

## Phase 6 — Role-Specific Enhancements & Integrations

**Goal:** Polish each role's unique dashboard features, connect external services.

- **Chairman:** Executive KPI overview, governance approvals, report exports
- **VP:** Operations control tower, escalation inbox, cross-department reports
- **HR:** Leave analytics, coverage heatmap, HR announcements
- **Driver:** Driver task board with status flow, proof of completion, delay reporting
- **Department leads:** Team scorecards, workload views, bulk task management
- **Integration activation:** Auth0 Passkeys config, Google Calendar FreeBusy + Meet link creation, Resend email delivery, reCAPTCHA on sensitive forms
- **Monitoring dashboard:** Integration health, security events, data governance (soft delete recovery)

---

## Technical Architecture Summary

```text
┌─────────────────────────────────────────────┐
│               React Frontend                │
│  Auth0 SDK → Role Router → Dashboard Shell  │
│  Sidebar (role-filtered) + Content Area     │
├─────────────────────────────────────────────┤
│           Supabase (External)               │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Auth   │ │ Database │ │  Edge Funcs  │  │
│  │ (Auth0) │ │  + RLS   │ │  (Resend,    │  │
│  │         │ │          │ │   GCal, etc) │  │
│  └─────────┘ └──────────┘ └─────────────┘  │
│  ┌──────────┐ ┌───────────┐                 │
│  │ Realtime │ │  Storage  │                 │
│  │(messages)│ │(files/att)│                 │
│  └──────────┘ └───────────┘                 │
└─────────────────────────────────────────────┘
```

## Key Decisions

- **Auth0 integration** will use `@auth0/auth0-react` SDK on the frontend, with a Supabase custom JWT integration to sync Auth0 users into Supabase for RLS
- **Roles** stored in `user_roles` table with `has_role()` security definer function (never client-side)
- **All 16 roles** get the same 9 global pages but with permission-filtered content and actions
- **Soft delete** pattern (`deleted_at` column) on all major entities
- **Audit logs** written via DB triggers or edge functions for every critical action
- **Integration placeholders** built now; actual API connections added in Phase 6 when keys are ready

## Recommended Starting Point

I will begin with **Phase 1** — this gives you a working login, role system, and navigable dashboard shell for all 16 roles. Each subsequent phase adds a functional module on top.

Shall I proceed with Phase 1 implementation?




# Role-Specific Dashboard Views

## Overview
Replace the single generic `DashboardHome` with role-aware dashboard views. The hierarchy:
- **Executive** (Chairman, VP): Full org visibility — all teams, all stats, escalations
- **Lead** (Head of Ops, Dev Lead, Tech Lead, Head of Accounting, Head of Marketing, Sales Lead) + **HR**: Team-level visibility — their team's tasks, leaves, workload
- **Employee** (all `*_employee` roles): Personal stats only — own tasks, leaves, messages
- **Driver**: Specialized task board with status flow

## Architecture

```text
DashboardHome.tsx
  └── switch on role tier:
        ├── ExecutiveDashboard  (chairman, vice_president)
        ├── HRDashboard         (hr)
        ├── LeadDashboard       (all LEAD_ROLES)
        ├── DriverDashboard     (driver)
        └── EmployeeDashboard   (all others)
```

Each dashboard is a separate component in `src/components/dashboard/`.

## New Edge Function: `dashboard-stats`
A single edge function that returns role-appropriate aggregated data. Accepts `actor_id` and returns stats based on the user's role:

- **Employee tier**: own open tasks, pending leaves, unread messages
- **Lead tier**: same as employee + team task counts (by status), team pending leaves, team member count, overdue task count
- **Executive tier**: same as lead but across ALL teams — per-department task counts, org-wide leave counts, total headcount, overdue critical tasks
- **HR tier**: org-wide leave stats, pending leave requests count, department coverage numbers
- **Driver tier**: own assigned tasks with status breakdown

The function queries `user_roles` to determine tier, then aggregates from `tasks`, `leaves`, `profiles`, `team_members` accordingly.

## Dashboard Components

### 1. EmployeeDashboard
- **Stats row**: Open Tasks, Pending Leaves, Unread Messages, Upcoming Meetings (placeholder)
- **Quick Access** links (existing)
- **My Recent Tasks** — last 5 tasks with status chips
- **My Leave Status** — current balance summary

### 2. LeadDashboard (extends employee view)
- **Stats row**: adds Team Tasks, Team Pending Leaves, Overdue Tasks, Team Size
- **Team Workload** section — list of team members with their open task count
- **Pending Approvals** — leaves awaiting review, tasks submitted for approval
- **Quick Access** links

### 3. ExecutiveDashboard (Chairman & VP)
- **Stats row**: Total Employees, Departments, Org-wide Open Tasks, Org-wide Pending Leaves
- **Department Scorecards** — grid of cards per department showing task counts, leave counts, overdue count
- **Escalation Summary** — overdue critical tasks across org
- **Quick Access** links

### 4. HRDashboard
- **Stats row**: Total Employees, Pending Leave Requests, Approved This Month, Coverage Risks
- **Leave Overview** — breakdown by type across org
- **Pending Leave Approvals** — actionable list
- **Quick Access** links

### 5. DriverDashboard
- **Stats row**: Assigned Tasks, In Progress, Completed Today
- **Task Board** — cards with status flow (accepted → en route → arrived → completed)
- **Quick Access** links (subset)

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/dashboard-stats/index.ts` | Create — aggregation edge function |
| `src/hooks/useDashboardStats.ts` | Create — hook calling the edge function |
| `src/components/dashboard/ExecutiveDashboard.tsx` | Create |
| `src/components/dashboard/HRDashboard.tsx` | Create |
| `src/components/dashboard/LeadDashboard.tsx` | Create |
| `src/components/dashboard/DriverDashboard.tsx` | Create |
| `src/components/dashboard/EmployeeDashboard.tsx` | Create |
| `src/components/dashboard/StatCard.tsx` | Create — reusable stat card |
| `src/components/dashboard/TeamWorkloadList.tsx` | Create — team member task counts |
| `src/components/dashboard/DepartmentScorecard.tsx` | Create — for executive view |
| `src/pages/DashboardHome.tsx` | Modify — route to correct dashboard by role tier |

## Role-to-Dashboard Mapping Logic (in DashboardHome)
```text
if role in EXECUTIVE_ROLES → ExecutiveDashboard
else if role === 'hr' → HRDashboard
else if role in LEAD_ROLES → LeadDashboard
else if role === 'driver' → DriverDashboard
else → EmployeeDashboard
```

## Data Flow
All dashboards call `useDashboardStats()` which invokes the `dashboard-stats` edge function. The edge function determines the user's role tier server-side and returns only the data that tier is allowed to see. No client-side data escalation is possible.


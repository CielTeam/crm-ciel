

# Phase 2: Directory + Admin Console

Build two fully functional, data-driven pages with proper database backing, RLS, and role-based access.

---

## 1. Directory Page

A searchable, filterable employee directory showing all active profiles with their roles, teams, and contact info.

### Features
- Search bar (filters by name/email in real-time)
- Filter by department dropdown
- Card grid layout showing: avatar, name, email, role badge, department, phone, status indicator
- Click a card to view a detail sheet (slide-over) with full profile info
- Responsive: cards on desktop, compact list on mobile

### Data Source
- Query `profiles` table (joined with `user_roles` and `teams`) where `deleted_at IS NULL` and `status = 'active'`
- All reads go through existing RLS (authenticated users can read profiles)

### Components
- `src/pages/DirectoryPage.tsx` — main page with search/filter state
- `src/components/directory/DirectoryCard.tsx` — individual user card
- `src/components/directory/DirectoryFilters.tsx` — search + department filter
- `src/components/directory/ProfileDetailSheet.tsx` — slide-over with full info

---

## 2. Admin Console Page

A user management dashboard for admins (`technical_lead`, `team_development_lead`) to manage users, roles, and teams.

### Features

**Users Tab:**
- Table of all users with columns: name, email, role, department, status, joined date
- "Add User" button opens a dialog to insert a new pending profile (email, name, role)
- Inline role change via dropdown (calls an edge function)
- Deactivate/reactivate user (soft-delete toggle)

**Teams Tab:**
- List of teams with department, lead, member count
- "Create Team" dialog
- Assign/remove team members

### Database Changes (migration)
None needed — existing tables (`profiles`, `user_roles`, `teams`, `team_members`) cover all requirements.

### Edge Function: `admin-manage-user`
A new edge function that validates the caller is an admin (via `is_admin` DB function), then performs:
- `create_user`: Insert pending profile + role
- `update_role`: Change a user's role
- `deactivate_user`: Set `deleted_at` / clear it
- `assign_team`: Insert/remove from `team_members`

All mutations go through this single edge function to enforce admin-only access server-side and log to `audit_logs`.

### Components
- `src/pages/AdminConsolePage.tsx` — tabs for Users / Teams
- `src/components/admin/UsersTable.tsx` — data table with actions
- `src/components/admin/AddUserDialog.tsx` — form to add new user
- `src/components/admin/TeamsTable.tsx` — teams management
- `src/components/admin/CreateTeamDialog.tsx` — form to create team

### Config
- Add `admin-manage-user` to `supabase/config.toml` with `verify_jwt = false` (validates admin in code using service role)

---

## 3. Audit Logs Page

Since admin actions will now generate audit logs, build the audit logs viewer:
- Paginated table of audit entries (action, actor, target, timestamp)
- Search/filter by action type and date range
- Read directly from `audit_logs` table (admin-only RLS already in place)

### Components
- `src/pages/AuditLogsPage.tsx` — table with filters and pagination

---

## Implementation Order
1. Directory page (read-only, no new backend)
2. Admin Console with `admin-manage-user` edge function
3. Audit Logs viewer

## Estimated Files Changed/Created
- 1 new edge function (`admin-manage-user/index.ts`)
- ~10 new component files
- 3 page rewrites
- 1 config.toml update



# Fix & Upgrade Task Management System

## Root Cause Analysis

**Critical finding**: The `team_members` table is completely empty and all `teams.lead_user_id` values are `null`. The backend's `getActorTeamMemberIds()` relies on `teams.lead_user_id = actorId` to find teams, then queries `team_members` for users — both return nothing. This means:

- **Bug #2 (Lead can't see employees)**: `team_development_lead` gets zero assignable users because the team membership data doesn't exist. The `assignable_users` action returns only the actor themselves.
- **Bug #1 (HR assignment error)**: HR is a global assigner and should see all users. The likely issue is either (a) an edge function deployment issue, or (b) an error in the create flow. Need to test after deploying the fix.

## Fix Strategy

Since team membership data is unpopulated, the backend must use **role-based department mapping** as the primary scoping mechanism instead of relying on `team_members`/`lead_user_id`. The `ROLE_DEPARTMENT` mapping already exists in `src/types/roles.ts` — replicate this logic in the edge function.

---

### Part 1 — Backend Fix (`supabase/functions/tasks/index.ts`)

**Replace `getActorTeamMemberIds` and `getExpandedAssignableUsers`** with role-department-aware logic:

1. Add a `ROLE_TO_DEPARTMENT` map in the edge function (mirrors `src/types/roles.ts`)
2. For lead roles: look up the actor's role → derive their department → find all users whose roles map to the same department via `user_roles` + the `ROLE_TO_DEPARTMENT` map
3. Keep the existing `teams`/`team_members` lookup as a secondary source (union with role-based results) for forward compatibility when teams are populated
4. For `sales_lead`: return users in both `sales` and `marketing` departments (existing logic, but now works via role mapping too)
5. Global assigners (chairman, VP, HR, head_of_operations): return all users (no change needed)

**Also fix**: The `assignable_users` action currently only populates `userIds` if `isLead` — non-lead users who somehow call this get an empty list plus themselves. This is correct behavior but should return a clear empty state.

### Part 2 — Frontend Error Handling

**`src/hooks/useTasks.ts`** — `useTaskInvoke`:
- Parse error responses properly — currently if `data.error` exists it throws, but the error message from the backend may not propagate cleanly
- Ensure the thrown error message is the backend's message (not generic)

**`src/components/tasks/AddTaskDialog.tsx`**:
- Add loading/error state feedback on the submit button
- Show toast on success

**`src/pages/TasksPage.tsx`**:
- Add success toast on task creation

### Part 3 — Test & Deploy

- Deploy the updated edge function
- Test `assignable_users` for each role type to verify correct scoping
- Test task creation with assignment

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/tasks/index.ts` | Add role-to-department mapping; rewrite `getExpandedAssignableUsers` to use role-based scoping as primary mechanism |
| `src/pages/TasksPage.tsx` | Add success toast on task creation |

No database migration needed — the fix is purely in the edge function's user-resolution logic.

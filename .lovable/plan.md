

# Add Assignee Dropdown to Add Task Dialog

## Overview

Add a user selection dropdown to the AddTaskDialog so tasks can be assigned to team members. The dropdown will fetch active users from the directory data and pass the selected `assigned_to` value through to the create mutation.

## Changes

### 1. `src/components/tasks/AddTaskDialog.tsx`
- Import and use `useDirectoryData` to fetch the list of active users
- Add an `assigned_to` state field (default: empty/unassigned)
- Add a Select dropdown after the priority/due-date row showing user display names
- Include "Unassigned" as the default option
- Update the `onSubmit` interface to include `assigned_to?: string | null`
- Pass `assigned_to` in the submit payload
- Reset `assignedTo` in the `reset()` function

### 2. `src/pages/TasksPage.tsx`
- No changes needed — the `createTask.mutate` already spreads the full payload, and `useCreateTask` in `useTasks.ts` already accepts `assigned_to` in its mutation function

## Technical Notes

- Reuses the existing `useDirectoryData` hook which queries active profiles
- The `assigned_to` field maps to `DirectoryUser.userId` (the Auth0 user_id stored in profiles)
- The edge function already handles `assigned_to` in the create action
- The Select will show `displayName` as label and `userId` as value


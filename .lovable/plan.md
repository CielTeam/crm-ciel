

# Searchable User Assignment Dropdown

## Overview

Replace the current basic `<Select>` dropdown for "Assign To" in the AddTaskDialog with a professional, searchable combobox using the existing `cmdk` (Command) component. This gives HR, VP, Chairman, Head of Operations, and Team Leads a filterable user picker with avatars and role labels.

## Current State

- The `AddTaskDialog` uses a plain `<Select>` with `<SelectItem>` entries — no search capability.
- The `useAssignableUsers` hook already returns the correct filtered list from the edge function (global assigners see everyone, leads see team members only, employees get empty list).
- The `cmdk` package is already installed and the `Command` UI component exists at `src/components/ui/command.tsx`.

## Changes

### 1. Update `src/components/tasks/AddTaskDialog.tsx`

Replace the "Assign To" `<Select>` with a `Popover` + `Command` combobox pattern:

- Use `Popover` + `PopoverTrigger` + `PopoverContent` wrapping a `Command` component
- `CommandInput` provides the search field with placeholder "Search users..."
- `CommandEmpty` shows "No users found" when search yields no results
- `CommandGroup` with `CommandItem` entries for each assignable user, displaying:
  - User avatar (small circle, fallback to initials)
  - Display name
  - Check icon when selected
- A "Personal task (no assignment)" option at the top
- The trigger button shows the selected user's name or "Select user..." placeholder
- Add `email` to the `useAssignableUsers` return type so users can also search by email

### 2. Update `useAssignableUsers` hook return type

Add `email` and `role` fields to the returned user objects for display in the dropdown.

### 3. Update edge function `assignable_users` action

Add `email` to the `select` query so the frontend can display and search by email. Also fetch user roles to show role badges in the dropdown.

### 4. Make the assignment field mandatory for assigners

When the current user has assignment capability (`assignableUsers.length > 0`), the "Assign To" field is shown prominently. The task can still be created as personal by selecting "Personal task".

## Files to Modify

| File | Change |
|------|--------|
| `src/components/tasks/AddTaskDialog.tsx` | Replace Select with Popover+Command searchable combobox |
| `supabase/functions/tasks/index.ts` | Add `email` to `assignable_users` select query |
| `src/hooks/useTasks.ts` | Add `email` to assignable users type |


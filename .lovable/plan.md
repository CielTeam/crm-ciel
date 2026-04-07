

# Fix 500 Error + Upgrade Task Creation UI

## Issue 1: 500 Internal Server Error

**Diagnosis**: The edge function's generic catch block (line 584-587) swallows the actual error and returns a generic "Internal server error" with no details. Edge function logs show no errors, suggesting the function may not be deployed with the latest code (the `ROLE_TO_DEPARTMENT` fix). Additionally, the `.or()` PostgREST filter at line 233 builds raw filter strings with Auth0 IDs containing `|` characters which may cause query parsing issues.

**Fix**:
1. **Redeploy the edge function** with the current code that has the `ROLE_TO_DEPARTMENT` mapping
2. **Improve error logging** in the catch block — include the actual error message in the response (sanitized) so the frontend can surface it
3. **Replace `.or()` string building** at line 233 with `.in()` queries — split into two queries (one for `assigned_to`, one for `created_by`) and merge results, avoiding raw filter string construction with special characters
4. **Frontend**: In `useTaskInvoke`, improve error parsing to surface the backend error message to the toast

## Issue 2: Task Creation UI/UX Upgrade

**Current state**: The duration field is a free-text input ("e.g. 2 hours"). Due time is a raw `<input type="time">`. Not professional enough.

**Redesign `AddTaskDialog.tsx`**:

### Duration Picker
- Replace free-text input with two side-by-side numeric inputs: **Hours** (0-99) and **Minutes** (0-59)
- Clean number steppers with labels
- Computed display: "2h 30m" stored as the `estimated_duration` string

### Due Date & Time
- Keep the date input but style it better with a calendar icon
- Keep the time input but add a label clarifying the timezone behavior
- Group date + time in a clear "Due Date & Time" section

### Overall UX Polish
- Add section groupings with subtle dividers
- Improve field spacing and visual hierarchy
- Inline validation: show red border + helper text for empty title on blur
- Priority selector: add color-coded dots next to each option (gray/yellow/orange/red)
- Disabled submit button shows tooltip explaining what's missing

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/tasks/index.ts` | Fix `.or()` filter, improve error responses, add error detail logging |
| `src/components/tasks/AddTaskDialog.tsx` | Redesign with structured duration picker, polished layout |
| `src/hooks/useTasks.ts` | Improve error message parsing in `useTaskInvoke` |

Then redeploy the edge function and verify.


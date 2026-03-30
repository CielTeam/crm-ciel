

# Fix CI Error: Remove `as any` from tasks Edge Function

## Problem

Line 91 in `supabase/functions/tasks/index.ts` uses `as any` to bypass the untyped Supabase client when inserting into `task_activity_logs`. The ESLint rule `@typescript-eslint/no-explicit-any` flags this as an error.

## Fix

Since the edge function uses an untyped `createClient` (no generics), `client.from('task_activity_logs')` already returns a loosely-typed builder that accepts `.insert()` with any record shape. The `as any` cast is unnecessary — it was added defensively but the untyped client doesn't restrict table names.

**Single change**: Remove the `as any` cast on line 91.

```typescript
// Before
await (client.from('task_activity_logs') as any).insert({

// After  
await client.from('task_activity_logs').insert({
```

This is the only `as any` usage in the entire codebase (confirmed via search). No other files need changes.

## File Modified

| File | Change |
|------|--------|
| `supabase/functions/tasks/index.ts` | Remove `as any` cast on line 91 |


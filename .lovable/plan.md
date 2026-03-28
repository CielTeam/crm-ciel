

# Fix Build Errors + Real-Time Messaging

## Part 1: Fix Login (verify-email edge function)

The screenshot shows `ERR_NAME_NOT_RESOLVED` when calling `verify-email`. The edge function code exists and is correct — it just needs to be redeployed. The function will be redeployed automatically when we touch the file. We'll add a minor whitespace change to trigger redeployment.

## Part 2: Fix All TypeScript Build Errors

There are 13 edge function TS errors and ~40 client-side TS errors, all caused by `unknown` type usage without proper casting.

### Edge Functions (cast `unknown` → proper types, cast `err` → `Error`)

| File | Fix |
|------|-----|
| `supabase/functions/tasks/index.ts` | **CRITICAL**: The file is truncated to only 86 lines (helper functions only, no `Deno.serve` handler). Must restore the full handler with all actions: `list`, `create`, `update`, `delete`, `assignable_users`, `list_activity`, `add_comment`, `list_comments`, `reassign`. Cast `logActivity` insert using `as any` to bypass typed client mismatch. |
| `supabase/functions/admin-list-data/index.ts` | Cast `err` to `Error` in catch block (line 83) |
| `supabase/functions/dashboard-stats/index.ts` | Add interfaces for role rows and task rows; cast accordingly (lines 35, 57, 190) |
| `supabase/functions/leaves/index.ts` | Cast `bal` to `Record<string, number>` instead of `unknown`; cast role rows; cast `err` (lines 110, 154, 186, 253) |
| `supabase/functions/messages/index.ts` | Cast `err` to `Error` (line 290) |
| `supabase/functions/notifications/index.ts` | Cast `err` to `Error` (line 101) |

### Client-Side Hooks (cast `unknown` → typed interfaces)

| File | Fix |
|------|-----|
| `src/hooks/useAdminData.ts` | Replace all `(r: unknown)`, `(t: unknown)`, `(p: unknown)`, `(m: unknown)` with proper typed interfaces |
| `src/hooks/useNotifications.ts` | Cast `payload.new` to a `Notification` interface instead of `unknown` (lines 65-88) |
| `src/hooks/useTasks.ts` | Cast realtime payload row to `{ created_by: string; assigned_to: string | null }` (lines 55-59) |

## Part 3: Real-Time Messaging

### Changes to `src/hooks/useMessages.ts`

1. **Remove polling**: Delete `refetchInterval: 15000` from `useConversations` and `refetchInterval: 5000` from `useMessages`
2. **Add `useMessagesRealtime` hook**: Subscribe to `postgres_changes` INSERT events on `messages` table filtered by `conversation_id`. On new message, invalidate `['messages', userId, conversationId]` and `['conversations', userId]` queries. Clean up channel on unmount or when conversationId changes.
3. **Add `useConversationsRealtime` hook**: Subscribe to changes on `conversations` table to catch updates (last message previews). Invalidate `['conversations', userId]`.

### Changes to `src/pages/MessagesPage.tsx`

1. Import and call both realtime hooks, passing `selectedId` and `user?.id`
2. Remove any polling-related logic

### Implementation Pattern (mirrors existing `useTasksRealtime`)

```typescript
export function useMessagesRealtime(conversationId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id || !conversationId) return;

    const channel = supabase
      .channel(`messages-rt-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['messages', user.id, conversationId] });
        qc.invalidateQueries({ queryKey: ['conversations', user.id] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, conversationId, qc]);
}
```

## Files Modified

| File | Summary |
|------|---------|
| `supabase/functions/tasks/index.ts` | Restore full handler + fix types |
| `supabase/functions/admin-list-data/index.ts` | Fix `err` cast |
| `supabase/functions/dashboard-stats/index.ts` | Fix role/task/err casts |
| `supabase/functions/leaves/index.ts` | Fix balance/role/err casts |
| `supabase/functions/messages/index.ts` | Fix `err` cast |
| `supabase/functions/notifications/index.ts` | Fix `err` cast |
| `supabase/functions/verify-email/index.ts` | Touch to trigger redeploy |
| `src/hooks/useAdminData.ts` | Add typed interfaces for all `unknown` casts |
| `src/hooks/useNotifications.ts` | Type the realtime payload |
| `src/hooks/useTasks.ts` | Type the realtime payload |
| `src/hooks/useMessages.ts` | Add realtime hooks, remove polling |
| `src/pages/MessagesPage.tsx` | Integrate realtime hooks |


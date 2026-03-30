

# Fix Message Sending + Direct Cache Updates

## Problem 1: Messages Not Sending

The `useEffect` in `MessagesPage.tsx` (line 44-48) includes `markRead` in its dependency array. Since `useMarkRead()` returns a new mutation object on every render, this creates an **infinite loop** — `markRead.mutate()` fires on every render, overwhelming the system and blocking message sends.

**Fix**: Remove `markRead` from the dependency array and use a ref or call `markRead.mutate` only once when `selectedId` changes.

## Problem 2: Upgrade Realtime to Direct Cache Updates

Replace all `invalidateQueries` calls in the realtime hooks and mutation callbacks with `setQueryData` for zero-network-request updates.

### Changes to `src/hooks/useMessages.ts`

**`useMessagesRealtime`** — Replace the invalidation callback with direct cache manipulation:
- On INSERT event, extract `payload.new` as `Message`
- Use `qc.setQueryData(['messages', userId, conversationId], ...)` to append the new message, check for duplicates by ID, maintain chronological order
- Use `qc.setQueryData(['conversations', userId], ...)` to update the matching conversation's `lastMessage`, `updated_at`, `unreadCount`, and re-sort conversations by `updated_at` descending

**`useConversationsRealtime`** — Remove entirely. The conversations cache is already updated directly by the messages realtime hook and by mutation callbacks. No separate subscription needed.

**`useSendMessage`** — Replace `onSuccess` invalidation with optimistic direct cache update:
- Append the returned message to `['messages', userId, conversationId]` via `setQueryData` (with duplicate check)
- Update the conversation's `lastMessage` and `updated_at` in `['conversations', userId]` via `setQueryData`

**`useMarkRead`** — Replace `onSuccess` invalidation with direct cache update:
- Set `unreadCount` to 0 for the specific conversation in `['conversations', userId]`

**`useCreateConversation`** — Keep invalidation here since we need the full conversation object with member data from the server.

### Changes to `src/pages/MessagesPage.tsx`

- Fix the `markRead` infinite loop: remove `markRead` from useEffect deps, use a ref pattern
- Remove `useConversationsRealtime` import if it was used separately

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useMessages.ts` | Direct cache updates, remove conversations realtime hook, fix mutation callbacks |
| `src/pages/MessagesPage.tsx` | Fix markRead infinite loop |


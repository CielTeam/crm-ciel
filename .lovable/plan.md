

# Real-Time Presence, Typing Indicators, and Read Receipts

## Architecture

All three features use Supabase Realtime channels (presence + broadcast) — no database changes, no polling, no edge function changes needed.

```text
┌─────────────────────────────────────────────┐
│  Supabase Realtime                          │
│                                             │
│  Channel: "presence-global"                 │
│    → presence track: { user_id, status }    │
│    → gives online/offline + last_seen       │
│                                             │
│  Channel: "chat-{conversationId}"           │
│    → broadcast "typing": { user_id }        │
│    → broadcast "read":   { user_id, msgId } │
│    → existing postgres_changes (messages)   │
└─────────────────────────────────────────────┘
```

## New Files

### 1. `src/hooks/usePresence.ts`
- Joins a single global presence channel on mount
- Tracks current user with `{ user_id, online_at }`
- Returns `Map<string, { isOnline, lastSeen }>` from presence state
- Cleans up channel on unmount
- Memoized to prevent re-render storms

### 2. `src/hooks/useTypingIndicator.ts`
- Takes `conversationId` — joins broadcast channel `chat-{id}`
- Exposes `sendTyping()` — debounced (400ms), broadcasts typing event
- Listens for incoming typing events from other users
- Auto-expires typing state after 2s of no events
- Returns `typingUserIds: string[]` and `sendTyping: () => void`
- Unsubscribes on unmount or conversation change

### 3. `src/hooks/useReadReceipts.ts`
- Takes `conversationId` and `messages`
- On the same `chat-{id}` channel, broadcasts `read` events when user views messages
- Listens for `read` events from others
- Tracks per-message status: `sent` → `delivered` → `seen`
- "delivered" = message exists (default); "seen" = read event received
- Returns `Map<string, 'sent' | 'delivered' | 'seen'>`

## Modified Files

### 4. `src/components/messages/MessageInput.tsx`
- Accept `onTyping` callback prop
- Call `onTyping()` on every `onChange` event (the hook handles debounce)

### 5. `src/components/messages/ConversationList.tsx`
- Accept `presenceMap` prop
- Show green dot on avatar when user is online
- Show "last seen X ago" below name when offline

### 6. `src/components/messages/MessageThread.tsx`
- Accept `typingUserIds` and `readReceipts` props
- Show "User is typing..." indicator at bottom of thread (animated dots)
- Show sent/delivered/seen status below each of current user's messages (checkmark icons)

### 7. `src/pages/MessagesPage.tsx`
- Use `usePresence()` — pass presenceMap to ConversationList
- Use `useTypingIndicator(selectedId)` — pass `sendTyping` to MessageInput, `typingUserIds` to MessageThread
- Use `useReadReceipts(selectedId, messages)` — pass receipts to MessageThread

## Channel Strategy (Performance)

- **One** global presence channel shared across the app
- **One** broadcast channel per active conversation (typing + read), cleaned up on conversation switch
- Merge typing + read onto the same channel to avoid redundant subscriptions
- All state updates use `useState` with functional updates to avoid stale closures
- Debounce typing broadcasts; auto-expire typing indicators via `setTimeout`

## UI Details

**Online indicator**: Small green circle (absolute positioned) on avatar in conversation list.

**Last seen**: Replace timestamp line with "last seen 5m ago" when user is offline.

**Typing indicator**: Below last message, animated "..." with user name. Disappears after 2s.

**Read receipts** (own messages only):
- Single gray check = sent
- Double gray check = delivered  
- Double blue check = seen


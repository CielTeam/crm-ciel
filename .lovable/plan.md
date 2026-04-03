

# Upgrade Messaging System to Production-Grade

## Issues Identified

1. **Read receipts**: Current implementation is broadcast-only (ephemeral). If user B isn't online when user A reads, the "seen" status is lost. No persistence. Also, `useReadReceipts` and `useTypingIndicator` create **separate channels** from `useMessagesRealtime`, causing redundant subscriptions.

2. **Presence**: Uses `(presences as any[])` — violates `no-explicit-any` lint rule. Otherwise structurally sound.

3. **Attachments**: `FileUploadButton` and `useUploadAttachment` still validate for `.zip/.rar` only (old policy). Server-side was updated to images+PDF but client-side was not. Downloads work via signed URLs from the edge function.

4. **Group chat**: Backend supports `type: 'group'` and multiple members. UI doesn't differentiate — shows single name, no sender labels in groups, no multi-avatar.

5. **Channel sprawl**: Three separate channels per conversation (`chat-{id}`, `chat-read-{id}`, `messages-rt-{id}`). Should consolidate.

## Plan

### Part 1 — Fix Read Receipts (persistent + broadcast)

**`supabase/functions/messages/index.ts`** — `mark_read` action:
- After updating `last_read_at`, return the list of message IDs that were marked as read (messages from others created after previous `last_read_at`)
- The response already includes `success: true`; extend to include `{ success: true, read_message_ids: string[] }`

**`src/hooks/useReadReceipts.ts`** — Rewrite:
- Remove separate channel. Use the same `chat-{id}` channel as typing (merge into a single shared channel hook or accept channel ref as param)
- On conversation open: call `mark_read` mutation → get back `read_message_ids` → broadcast `read` event on the channel with those IDs
- Listen for `read` broadcast events → update receipts map to `seen`
- Initialize own messages as `delivered` by default
- For messages where `created_at < last_read_at` of other member → mark as `seen` (derive from conversation data)
- Accept a `channelRef` param instead of creating its own channel

**`src/hooks/useMessages.ts`** — `useMarkRead`:
- Update to return the read message IDs from the response

### Part 2 — Fix Presence (remove `any`, keep structure)

**`src/hooks/usePresence.ts`**:
- Replace `(presences as any[])` with a proper `PresencePayload` interface: `{ user_id: string; online_at: string }`
- Cast via `unknown` → typed interface to satisfy `no-explicit-any`

### Part 3 — Consolidate Channels (typing + read on one channel)

**New: `src/hooks/useChatChannel.ts`**:
- Single hook that creates `chat-{conversationId}` channel
- Handles: typing broadcast/listen, read broadcast/listen
- Returns `{ channelRef, typingUserIds, sendTyping, readReceipts, broadcastRead }`
- Cleans up on conversation change or unmount
- Replaces separate `useTypingIndicator` and `useReadReceipts`

**Delete**: `src/hooks/useTypingIndicator.ts` and `src/hooks/useReadReceipts.ts` (merged into `useChatChannel`)

### Part 4 — Fix Attachments (client-side validation)

**`src/components/shared/FileUploadButton.tsx`**:
- Update `accept` to `.jpg,.jpeg,.png,.gif,.webp,.pdf`
- Update validation to allow image extensions + `.pdf`
- Update max size to 5MB
- Update error messages

**`src/hooks/useAttachments.ts`** — `useUploadAttachment`:
- Update allowed extensions to images + PDF
- Update max size to 5MB

### Part 5 — Group Chat UI

**`src/components/messages/ConversationList.tsx`**:
- For `type === 'group'`: show conversation name or fallback "Alice, Bob, +2"
- Show stacked avatars (2-3 overlapping) for group conversations
- Presence dot: show if any member is online

**`src/components/messages/MessageThread.tsx`**:
- For group conversations: always show sender name above each message (currently only shows for non-self messages, which is correct — keep)
- Show image preview for image attachments inline

**`src/pages/MessagesPage.tsx`**:
- Pass `conversationType` to components so they can differentiate
- Show member count in header for groups
- Replace `useChatChannel` instead of separate typing/read hooks
- Wire up `broadcastRead` on conversation select

**`src/components/messages/NewConversationDialog.tsx`**:
- Add optional group name input when >1 member selected

### Part 6 — Chat Header with Presence

**New: `src/components/messages/ChatHeader.tsx`**:
- Shows conversation name/user name
- For direct: green dot + "Online" or "Last seen 5 min ago"
- For group: member count, "X online"
- Clean, minimal design

## Files Modified/Created

| File | Action |
|------|--------|
| `src/hooks/useChatChannel.ts` | Create — consolidated typing + read receipts |
| `src/hooks/usePresence.ts` | Fix `any` types |
| `src/hooks/useTypingIndicator.ts` | Delete (merged) |
| `src/hooks/useReadReceipts.ts` | Delete (merged) |
| `src/hooks/useMessages.ts` | Update `useMarkRead` to return read IDs |
| `src/hooks/useAttachments.ts` | Fix allowed types/size |
| `src/components/shared/FileUploadButton.tsx` | Fix allowed types/size |
| `src/components/messages/ChatHeader.tsx` | Create — presence-aware header |
| `src/components/messages/ConversationList.tsx` | Group chat display, stacked avatars |
| `src/components/messages/MessageThread.tsx` | Image previews for attachments |
| `src/components/messages/MessageInput.tsx` | No changes needed |
| `src/components/messages/NewConversationDialog.tsx` | Group name input |
| `src/pages/MessagesPage.tsx` | Wire new hooks, add header |
| `supabase/functions/messages/index.ts` | Return read message IDs from `mark_read` |




# Phase 2: Leaves Module, Messages Module, and Dashboard Live Stats

This plan covers three modules the user selected. Given the scope, we'll build them sequentially in this order: **Leaves → Dashboard Live Stats → Messages**.

---

## 1. Leaves Module

### Database

**`leaves` table:**
```sql
CREATE TABLE leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'annual',  -- annual, sick, personal, unpaid
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, approved, rejected, cancelled
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  reviewer_id TEXT,                            -- who approved/rejected
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

**RLS:** Service role full access; users can SELECT own leaves; leads/executives can SELECT leaves for their department members.

**`leave_balances` table:**
```sql
CREATE TABLE leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  annual INT NOT NULL DEFAULT 21,
  sick INT NOT NULL DEFAULT 10,
  personal INT NOT NULL DEFAULT 5,
  used_annual INT NOT NULL DEFAULT 0,
  used_sick INT NOT NULL DEFAULT 0,
  used_personal INT NOT NULL DEFAULT 0,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS:** Service role full access; users can SELECT own balance.

### Backend: Edge Function `supabase/functions/leaves/index.ts`

Actions:
- `list` — User's leave requests (+ pending requests for reviewers)
- `create` — Submit leave request (validates balance, dates)
- `review` — Approve/reject (restricted to leads, executives, HR)
- `cancel` — Cancel own pending request
- `balances` — Get current user's leave balance

Includes audit logging for create/review/cancel actions.

### Frontend

| File | Purpose |
|------|---------|
| `src/hooks/useLeaves.ts` | `useLeaves()`, `useLeaveBalances()`, `useCreateLeave()`, `useReviewLeave()`, `useCancelLeave()` |
| `src/pages/LeavesPage.tsx` | Full page with balance cards, leave list, filters by status/type, submit dialog |
| `src/components/leaves/LeaveBalanceCards.tsx` | Visual cards showing remaining annual/sick/personal days |
| `src/components/leaves/LeaveRequestDialog.tsx` | Form: type, start/end date, reason |
| `src/components/leaves/LeaveCard.tsx` | Individual leave request with status badge, review actions for managers |

### Approval Logic
- HR, department heads, and executives can approve/reject leaves for users in their scope
- The edge function validates the reviewer's role before allowing review actions

---

## 2. Dashboard Live Stats

### Changes

**`src/pages/DashboardHome.tsx`:**
- Import `useTasks` to get open task count
- Import `useLeaves` (once built) to get pending leave count
- Replace the static "—" values with real counts:
  - **Open Tasks**: count of tasks with status != 'done'
  - **Pending Leaves**: count of user's leaves with status 'pending'
  - **Upcoming Meetings**: keep "—" (meetings not yet built)
  - **Unread Messages**: keep "—" (messages not yet built)

No new backend work needed — reuses existing hooks.

---

## 3. Messages Module

### Database

**`conversations` table:**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'direct',  -- direct, group
  name TEXT,                             -- group name (null for direct)
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`conversation_members` table:**
```sql
CREATE TABLE conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
```

**`messages` table:**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

**RLS:** Service role full access; users can SELECT messages/conversations they are members of.

### Backend: Edge Function `supabase/functions/messages/index.ts`

Actions:
- `list_conversations` — User's conversations with last message preview and unread count
- `get_messages` — Messages in a conversation (paginated)
- `send_message` — Send a message
- `create_conversation` — Start direct or group conversation
- `mark_read` — Update `last_read_at`

### Frontend

| File | Purpose |
|------|---------|
| `src/hooks/useMessages.ts` | `useConversations()`, `useMessages(conversationId)`, `useSendMessage()`, `useCreateConversation()`, `useMarkRead()` |
| `src/pages/MessagesPage.tsx` | Split layout: conversation list (left) + message thread (right) |
| `src/components/messages/ConversationList.tsx` | List of conversations with last message preview, unread badge |
| `src/components/messages/MessageThread.tsx` | Message bubbles with timestamps, scroll-to-bottom |
| `src/components/messages/MessageInput.tsx` | Text input with send button |
| `src/components/messages/NewConversationDialog.tsx` | User picker to start a new direct or group chat |

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/...` | Create leaves, leave_balances, conversations, conversation_members, messages tables |
| `supabase/functions/leaves/index.ts` | Leaves CRUD edge function |
| `supabase/functions/messages/index.ts` | Messages CRUD edge function |
| `supabase/config.toml` | Register leaves and messages functions |
| `src/hooks/useLeaves.ts` | Leave hooks |
| `src/hooks/useMessages.ts` | Message hooks |
| `src/pages/LeavesPage.tsx` | Full leaves page |
| `src/pages/MessagesPage.tsx` | Full messages page |
| `src/pages/DashboardHome.tsx` | Wire live stats |
| `src/components/leaves/*` | LeaveBalanceCards, LeaveRequestDialog, LeaveCard |
| `src/components/messages/*` | ConversationList, MessageThread, MessageInput, NewConversationDialog |

All pages include `PageError` fallbacks and are wrapped by the existing `ErrorBoundary`.


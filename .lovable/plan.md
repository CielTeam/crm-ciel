

# Bug Fixes + Polish Plan

## 1. Opportunities 500 errors (root cause confirmed)
Edge log: `cannot insert a non-DEFAULT value into column "weighted_forecast"` — it's a **generated column**.

**Fix** in `supabase/functions/opportunities/index.ts`:
- Remove `weighted_forecast` from the `insert` payload (line 150) in `create_opportunity`
- Remove the `update.weighted_forecast = …` block (lines 190–192) in `update_opportunity`
- The DB recomputes it automatically from `estimated_value × probability_percent / 100`

This fixes both **create** and **change_stage** 500s (change_stage doesn't write it, but update_opportunity does).

## 2. Leads CSV filename missing filter info
In `src/pages/LeadsPage.tsx` `handleExport`, the summary builder skips `filters.stages` (multi-select) and only includes the active tab. Country code is included but as raw "lb" so user may not recognize it.

**Fix**:
- Include `filters.stages?.join('-')` in the summary
- Prefix country with "country-" and stage with "stage-" so filename reads e.g. `leads_stage-qualified_country-lb_2026-04-18.csv`
- Apply the same readability fix to Accounts and Opportunities exports

## 3. Form responsiveness
Audit the dialogs that overflow on small viewports (988px and below). Likely culprits: `AddLeadDialog`, `EditLeadDialog`, `AddOpportunityDialog`, `AddAccountDialog`, `LeadDetailSheet`, `AccountDetailSheet`, `LeaveRequestDialog`.

**Fix pattern**:
- Wrap dialog body in `max-h-[85vh] overflow-y-auto` so it scrolls instead of clipping
- Change two-column grids to `grid-cols-1 sm:grid-cols-2`
- Ensure Sheet content uses `w-full sm:max-w-xl` (not fixed wide)
- Add `pb-4` to dialog footers so buttons don't sit on viewport edge

## 4. Messages — sidebar unread badge + unread filter
**Sidebar badge** (`src/components/layout/AppSidebar.tsx`):
- Add a small `useTotalUnreadMessages()` hook deriving total from existing `useConversations` cache (sum of `unreadCount`)
- Render a Badge next to "Messages" item when count > 0; collapsed mode shows a dot

**Unread filter** (`src/pages/MessagesPage.tsx` + `ConversationList.tsx`):
- Add a toggle "Unread only" above the conversation list
- When on, filter `conversations` to those with `unreadCount > 0`
- Persist toggle state in `localStorage`

## 5. Sixth question — what's next (no code)

The Leads / Accounts / Opportunities trio is now feature-complete for core CRM workflow:
- ✅ Geography, scoring, services, expiry automation, audit trail
- ✅ Server-side filtering with URL sync + saved views
- ✅ Stage discipline, lead cockpit, risk flags
- ✅ Full Lead → Account → Opportunity continuity (after this fix)
- ✅ Lifecycle management with notes, activity, documents on every entity
- ✅ Filter-aware exports, admin recompute, role-scoped visibility

**Recommended next direction**: move to **other modules** rather than deepening these three. The most valuable next areas, in order of business impact:

1. **Tasks ↔ CRM bridge** — link tasks to leads/accounts/opportunities so reps can manage follow-ups in one place; surface CRM-linked tasks on the cockpit panels.
2. **Meetings module** (already in memory as planned) — Google FreeBusy integration, meeting → activity log on the linked lead/account.
3. **Reporting/Dashboards upgrade** — pipeline forecast widget on Executive Dashboard pulling from opportunities; conversion funnel; rep leaderboard.
4. **Notifications deepening** — digest emails (daily summary of overdue follow-ups, expiring services, stalled deals).
5. **Mobile polish pass** across the whole app once the responsive dialog fixes from this turn are validated.

Optional CRM deepening only if business demands it later: quote/invoice generation from opportunities, email-thread sync, territory management.

## File Impact (~7)
- `supabase/functions/opportunities/index.ts` — drop weighted_forecast writes
- `src/pages/LeadsPage.tsx`, `src/pages/AccountsContactsPage.tsx`, `src/pages/OpportunitiesPage.tsx` — better filter summaries
- `src/components/layout/AppSidebar.tsx` + new tiny hook in `src/hooks/useMessages.ts` — unread badge
- `src/pages/MessagesPage.tsx` + `src/components/messages/ConversationList.tsx` — unread filter toggle
- 4–6 dialog/sheet files — responsive class tweaks

No DB migrations needed.


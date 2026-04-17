

User approved Phase 2 already. Next is Phase 3 per the original plan. Phase 3 has three sub-parts (Lead Cockpit, Discipline Rules, Account Lifecycle). Also need to add Saved Views which was part of Phase 2 but deferred — I'll fold it in or note it.

Actually re-reading: Phase 2 was "Filtering + Saved Views". Filtering is done; Saved Views was deferred. I should either (a) finish Saved Views first, or (b) move to Phase 3. The user said "next phase" — meaning Phase 3. I'll skip Saved Views (can be a follow-up) and execute Phase 3 as originally scoped.

Phase 3 plan:

# Phase 3 — Lead Cockpit + Discipline Rules + Account Lifecycle

## 3A. Lead Detail Cockpit (UI refactor)

Refactor `LeadDetailSheet.tsx` to a **2-column layout**:
- **Left (main, ~70%)**: existing tabs (Overview, Activity, Notes, Tasks, Files, Quotes)
- **Right (sticky, ~30%)**: new `LeadCockpitPanel.tsx` showing:
  - Owner (avatar + name)
  - Stage badge + score badge (from DB)
  - Next follow-up (with overdue highlight)
  - Last contacted
  - Estimated value + weighted forecast
  - Open tasks count (placeholder = 0 until tasks linked)
  - Services summary (count + at-risk count)
  - **Risk flag chips**: No activity 14d, Overdue follow-up, Duplicate detected, Missing next step

**Quick action bar** (top of sheet, above tabs):
- Buttons: Log Call, Log Meeting, Add Note, Add Task, Schedule Follow-up, Add Service, Convert/Reopen/Mark Lost
- "Log Call" / "Log Meeting" / "Add Note" → open `LeadNotesPanel` pre-filled with appropriate `note_type`
- "Schedule Follow-up" → small inline date picker that PATCHes `next_follow_up_at`
- Convert / Mark Lost / Reopen wired to existing dialogs

## 3B. Discipline Rules (server-enforced)

Edit `supabase/functions/leads/index.ts` `change_stage` and `update` actions:
- Moving to `qualified` → require `(contact_email OR contact_phone) AND estimated_value > 0`
- Moving to `won` → require `estimated_value > 0 AND expected_close_date IS NOT NULL`
- Moving to `lost` → require `lost_reason_code IS NOT NULL` (already partially enforced via `mark_lost` flow; reinforce here)
- Return `400` with `{ error: "discipline_violation", field: "...", message: "..." }`
- Client surfaces actionable toasts in `LeadsKanbanView` drag handler and `EditLeadDialog`/stage selector

## 3C. Account Lifecycle

**DB migration** on `accounts`:
- `account_status text default 'active'` — active | inactive | pending
- `account_type text default 'prospect'` — prospect | customer | partner
- `account_health text default 'healthy'` — healthy | at_risk | critical

**New tables**:
- `account_notes` (id, account_id, author_id, note_type, content, outcome, next_step, contact_date, duration_minutes, created_at, deleted_at)
- `account_activities` (id, account_id, actor_id, activity_type, title, changes jsonb, metadata jsonb, created_at)
- RLS: SELECT via `has_leads_access_scoped(jwt_sub, accounts.owner)`; service role full access

**Edge function `accounts/index.ts`** — new actions:
- `add_note`, `list_notes`, `list_activities`
- Auto-log activities on `update_account`, `create_account`, `delete_account`, status/type/health changes

**`AccountDetailSheet` → tabbed cockpit**:
- Tabs: Details (current view), Contacts, Notes, Activity, Opportunities (placeholder), Documents (wire to existing `attachments` with `entity_type='account'`)
- Status / Type / Health selectors in Details tab
- Right-side flag chips: no owner, no activity > 30d, no contacts linked

**New components**:
- `AccountNotesPanel.tsx` (mirror of `LeadNotesPanel`)
- `AccountActivityTimeline.tsx` (mirror of `LeadActivityTimeline`)
- `AddAccountNoteDialog.tsx`

**Hooks** in `useAccountsContacts.ts`:
- `useAccountNotes(accountId)`, `useAddAccountNote()`, `useAccountActivities(accountId)`

## File Impact

**New (5)**: `LeadCockpitPanel.tsx`, `AccountNotesPanel.tsx`, `AccountActivityTimeline.tsx`, `AddAccountNoteDialog.tsx`, migration SQL

**Edited (6)**: `LeadDetailSheet.tsx`, `AccountDetailSheet.tsx`, `useLeads.ts` (deduplicate score helpers, add followup mutation), `useAccountsContacts.ts`, `supabase/functions/leads/index.ts` (discipline), `supabase/functions/accounts/index.ts` (notes/activities + lifecycle fields)

**Migrations (1)**: account lifecycle cols + `account_notes` + `account_activities` tables with RLS

## Out of scope (deferred)

- Saved Views (Phase 2 leftover) — can pick up after Phase 3 or in Phase 4
- Real "open tasks count" on cockpit — needs lead↔task linking; will show 0 placeholder
- Opportunities tab content — placeholder only


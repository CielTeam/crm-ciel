

# Enterprise Upgrade — Phased Plan

The request spans 10 areas. Doing it all in one shot would produce an unreviewable mega-change and risk regressions in a working system. I'm proposing a **4-phase rollout**, executed one phase per turn so you can review and ship each safely. Each phase ends in a fully working, deployable state.

---

## Phase 1 — Foundations (Country/Region + Account CRUD + Scoring Backend)

These are blocking dependencies for everything else.

### 1A. Country / Region (Critical First)
**DB migration**
- `leads`: add `country_code text`, `country_name text`, `state_province text`
- `accounts`: add `country_code text`, `country_name text`, `state_province text`
- Backfill: best-effort match existing `country` text → ISO code via lookup table; preserve original in `country_name` if no match
- Keep legacy `country` column (don't drop) for safety; mark deprecated in code

**New shared module** `src/lib/countries.ts`
- Full ISO 3166-1 list (alpha-2 + name)
- `PINNED_COUNTRIES`: LB, AE, SA, QA, KW, OM, BH, JO, EG, TR, FR, GB

**New component** `src/components/shared/CountryCombobox.tsx`
- shadcn `Command` + `Popover` searchable combobox
- Pinned section on top, divider, then alphabetical
- Stores `country_code`, displays `country_name`

**Wire-in**
- `AddLeadDialog`, `EditLeadDialog`: replace country input → combobox; add State/Province text field above City
- `leads` edge function `create`/`update`: accept + validate `country_code` (2-letter), persist `country_name`, `state_province`
- `convert` action: copy `country_code`, `country_name`, `state_province`, `city` from lead → account
- Validation: country required when creating company-type leads

### 1B. Account / Contact Full CRUD
**Edge function `accounts/index.ts`** — add actions:
- `create_account`, `delete_account` (soft-delete)
- `create_contact`, `delete_contact` (soft-delete)
- All with RBAC (chairman/VP/head_of_operations) + audit logs

**UI**
- `AddAccountDialog`, `AddContactDialog` (with country combobox)
- "New Account" / "New Contact" buttons on `AccountsContactsPage`
- Delete from detail sheets with confirmation

### 1C. Lead Scoring → Backend (authoritative)
**DB migration**
- `leads`: add `score int default 0`, `score_band text default 'cold'`, `score_updated_at timestamptz`

**Edge function** — port `computeLeadScore` logic to Deno, recompute server-side on:
- `create`, `update`, `change_stage`, `add_note`, `add_service`
- Add `recompute_score` action for backfill

**Client** — read `lead.score` / `lead.score_band` from DB; mark client-side `computeLeadScore` deprecated (keep as fallback for un-migrated rows, remove in Phase 4)

---

## Phase 2 — Advanced Filtering + Saved Views

**New component** `src/components/leads/LeadsFilterBar.tsx` — sticky bar above table with:
- Owner, Stage (multi), Source, Industry, Country, City
- Date ranges: Created, Expected Close, Last Contacted
- Numeric ranges: Value, Probability
- Score band, Tags
- Quick toggles: Overdue follow-ups, No activity > 14d, Expiring services, Converted/Not

**State**: Single `LeadFilters` object; debounced (300ms); URL-synced via `useSearchParams`

**Edge function** — extend `list_with_services` to accept full filter payload, do filtering server-side (avoid the 1000-row client cap)

**Saved Views**
- New table `lead_saved_views` (id, user_id, name, filters jsonb, sort jsonb, columns jsonb, is_shared bool, role_default text nullable)
- RLS: read own + shared; write own
- UI: "Saved views" dropdown next to filter bar; Save/Update/Delete/Share controls

**Mirror filter bar on Accounts page** (subset relevant to accounts)

---

## Phase 3 — Lead Cockpit + Account Lifecycle + Discipline Rules

### 3A. Lead Detail Cockpit
- Reorganize `LeadDetailSheet` to **2-column layout**: main tabs (left) + sticky right summary panel
- Right panel: owner, stage, next follow-up, last contact, value, weighted forecast, score, open tasks count, services summary, **risk flags chips** (no activity / overdue / duplicate detected)
- Quick action bar (top): Log Call, Log Meeting, Add Note, Add Task, Schedule Follow-up, Add Service, Convert/Reopen/Mark Lost
- Each "log" action opens a pre-filled `LeadNotesPanel` entry with the right `note_type`

### 3B. Discipline Rules (server-enforced in edge function)
- Cannot move to `qualified` without `contact_email OR contact_phone` AND `estimated_value > 0`
- Cannot mark `lost` without `lost_reason_code`
- Cannot mark `won` without `estimated_value > 0` AND `expected_close_date`
- Return structured 400 errors → client surfaces actionable toasts

### 3C. Account Lifecycle
**DB migration** on `accounts`:
- `account_status text default 'active'` (active/inactive/pending)
- `account_type text default 'prospect'` (prospect/customer/partner)
- `account_health text default 'healthy'` (healthy/at_risk/critical)

**New tables**:
- `account_notes` (mirror of `lead_notes`)
- `account_activities` (mirror of `lead_activities`)
- RLS via `has_leads_access_scoped(_, owner)`

**Edge function `accounts`**: add `add_note`, `list_notes`, `list_activities`

**`AccountDetailSheet` → tabbed cockpit**: Details, Contacts, Notes, Activity, Opportunities (placeholder), Documents (wire to existing `attachments` table with `entity_type='account'`)

**Account flags chips**: no owner, no activity > X days, no contacts linked

---

## Phase 4 — Duplicates + UX Polish + Performance

### 4A. Duplicate Center
- New page `/leads/duplicates` (or modal from leads page)
- Lists detected duplicate clusters (uses existing `normalized_company/email/phone` columns)
- Confidence score (exact email = high, fuzzy company = medium)
- Side-by-side merge UI: pick winner per field
- New edge function action `merge_leads`: moves notes + activities + services to winner, soft-deletes loser, logs in audit_logs

### 4B. UX Polish (Leads + Accounts tables)
- Column chooser dropdown (persisted to localStorage)
- Density toggle (compact/comfortable)
- Export current filtered view (uses Phase 2 filter state, not all rows)
- Better empty states with "Create first lead" CTA
- Inline badges with tooltips
- Sticky filter bar (CSS)

### 4C. Performance
- Server-side pagination for `list_with_services` (page + pageSize params)
- Optimistic updates on stage change & owner assign
- Remove deprecated client-side `computeLeadScore`

---

## What's NOT in scope (intentionally deferred)

- Opportunities pipeline UI (you previously chose Accounts first; flag for future phase)
- "At Risk" auto-flag based on multiple failed follow-ups (needs follow-up outcome tracking — small future addition)
- Email/phone integration (mailto/tel links — trivial polish, can roll into Phase 4 if time)

---

## File Impact Summary

| Phase | New files | Edited files | DB migrations |
|---|---|---|---|
| 1 | `lib/countries.ts`, `CountryCombobox.tsx`, `AddAccountDialog.tsx`, `AddContactDialog.tsx` | `leads/index.ts`, `accounts/index.ts`, `useLeads.ts`, `useAccountsContacts.ts`, Add/Edit lead dialogs | leads+accounts geo cols, leads score cols |
| 2 | `LeadsFilterBar.tsx`, `AccountsFilterBar.tsx`, `useSavedViews.ts`, `SavedViewsMenu.tsx` | `LeadsPage.tsx`, `AccountsContactsPage.tsx`, `leads/index.ts` | `lead_saved_views` table |
| 3 | `LeadCockpitPanel.tsx`, `AccountNotesPanel.tsx`, `AccountActivityTimeline.tsx`, `AddAccountNoteDialog.tsx` | `LeadDetailSheet.tsx`, `AccountDetailSheet.tsx`, `leads/index.ts`, `accounts/index.ts` | account lifecycle cols, `account_notes`, `account_activities` |
| 4 | `DuplicateCenter.tsx`, `MergeLeadsDialog.tsx`, `ColumnChooser.tsx` | `LeadsTable.tsx`, `LeadsPage.tsx`, `leads/index.ts` | none |

---

## Confirmation needed before I start

I will execute **Phase 1 only** in the next turn. Reply "go" (or just approve) and I'll start with the country migration, then Account CRUD, then scoring backend — all in one phase, fully working. After review you can greenlight Phase 2.

If you want a different ordering (e.g., do filters before scoring) or want to drop/add scope, tell me now.


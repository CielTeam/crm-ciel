

# Final Wrap-Up Plan

## 1. Bug fix (root cause of "test company not showing")

**Problem**: `useAccounts` and `useContacts` fall back to direct `supabase.from(...).select(...)` calls when no filters are active. The project uses **Auth0 JWTs** (not Supabase Auth), so direct PostgREST calls go as anon — `x-auth0-sub` header is missing — and the RLS policy `has_leads_access_scoped(jwt_sub, owner)` evaluates against `NULL` → returns `false` → empty result.

I verified this in the database:
- Lead `test company` (id `a2f6...`) was successfully converted on 2026-04-16
- Account `df4f...` exists, owner = `auth0|69ae8...` (lead's assigned_to), not deleted
- Converting user is `auth0|69daa...` with role `vice_president` (global access)
- RLS would correctly allow them — but only if the JWT header reaches PostgREST, which it doesn't on direct queries

**Fix**: Route ALL list reads through the edge function (which forwards the bearer token + sub header). Apply to both `useAccounts` (drop the no-filter branch) and `useContacts` (add a `list_contacts` action to the `accounts` edge function and switch the hook to use it).

Files: `supabase/functions/accounts/index.ts`, `src/hooks/useAccountsContacts.ts`.

## 2. What's left from the original 4-phase plan

| Item | Status |
|---|---|
| **2A.** Documents tab on `AccountDetailSheet` (entity_type=`account`) | Not wired (attachments fn already supports it) |
| **2B.** Documents tab on `LeadDetailSheet` (entity_type=`lead`) | Not wired (need to whitelist `lead` in attachments fn) |
| **2C.** Filter-aware Leads CSV export (filename includes filter summary) | Pending |
| **2D.** CSV export on Accounts and Opportunities pages | Pending |
| **2E.** Admin-only "Recompute all lead scores" button (hook exists) | Pending |
| **2F.** Verify Convert flow also creates an Opportunity (per Phase 4 plan — current convert only creates account+contact, no opportunity row) | Needs check + fix |

I'll verify 2F by looking at the convert action — if it doesn't insert into `opportunities`, I'll add it.

## 3. Testing scenarios (to run after fixes ship)

### Leads page
1. **Filtering & URL sync** — apply each filter (owner, stage, country, value range, probability range, date range, score band, hot/cold toggle); verify table updates and URL `?` params reflect state. Reload — filters persist.
2. **Saved Views** — save current filter combo as "My Hot LB", toggle share on, save another as default. Reload page with no URL params → default auto-applies. Switch user → shared view visible to other user, private view not.
3. **Stage discipline** — try moving a lead to `qualified` without `estimated_value` → toast error. Try `won` without `expected_close_date` → toast error. Set required fields → succeeds.
4. **Lead Cockpit** — open a lead with no activity in 14+ days → "14d no activity" risk chip shows. Quick Actions: Log Call, Log Meeting, Log Email each create a `lead_notes` row + `lead_activities` entry.
5. **Conversion** — convert a `won` lead. Verify: account row created, contact row created, opportunity row created (after fix 2F), lead's `converted_at`/`converted_to_id` set. Open Accounts page → account appears (after fix 1). Open Opportunities page → opportunity appears.
6. **Unconvert** — call unconvert on the same lead → account/contact/opportunity soft-deleted, lead metadata cleared.
7. **CSV export (after 2C)** — apply 2 filters, export → filename includes filter summary, rows match filtered view only.

### Accounts page
8. **Visibility (the bug)** — log in as the converting user (VP) → `test company` account visible immediately on page load (no filters needed). Log in as a non-owner non-admin → not visible.
9. **AccountsFilterBar** — filter by status `active`, type `prospect`, health `healthy`, country, industry, owner, search → server-side query returns matching subset. Clear filters → all accounts visible again.
10. **Lifecycle badges** — verify color coding (green=active/healthy, amber=pending/at_risk, red=critical, sky=prospect, primary=customer, violet=partner).
11. **Account cockpit tabs** — Details (change Status/Type/Health via selectors → persists + activity logged), Contacts (linked contacts list), Notes (add note → appears + activity row), Activity (timeline shows status changes + notes).
12. **Documents tab (after 2A)** — upload a PDF on an account → appears in list, signed download works, delete works.
13. **Risk flags** — open an account with no contacts → "No contacts linked" chip; with no notes in 30d → "30d no activity" chip.

### Opportunities page
14. **List & scope** — VP sees all; Head of Operations sees own + team; Employee sees only own.
15. **Stage transitions** — change stage → `weighted_forecast` recomputes (`value × probability/100`); audit logged.
16. **Account → Opportunities tab** — open account converted from a lead → its opportunity appears in the Opportunities tab.

### Cross-cutting
17. **Recompute scores (after 2E)** — Admin clicks button → confirmation dialog shows count → recompute runs → leads' `score` and `score_band` update.
18. **Mobile responsiveness** — Leads filter bar collapses cleanly on 375px width; Accounts table horizontally scrollable.

## File impact (next message)

**Edited (~5)**: `supabase/functions/accounts/index.ts` (+ `list_contacts` action), `src/hooks/useAccountsContacts.ts` (always-server lists), `supabase/functions/leads/index.ts` (verify+add opportunity insert in convert), `supabase/functions/attachments/index.ts` (whitelist `lead`), `src/components/leads/LeadDetailSheet.tsx` + `src/components/accounts/AccountDetailSheet.tsx` (Documents tab), `src/pages/LeadsPage.tsx` + `src/pages/AccountsContactsPage.tsx` + `src/pages/OpportunitiesPage.tsx` (CSV exports), `src/components/leads/LeadsFilterBar.tsx` or LeadsPage (admin recompute button).

No new migrations needed.

After this, the system will display the converted `test company` account immediately, and every Phase 1–4 commitment (geography, accounts CRUD + lifecycle + notes/activity, server filters with shareable URLs + saved views, lead cockpit + risk flags, stage discipline, full Lead → Account → Opportunity continuity, documents on all CRM entities, filter-aware exports) will be live.


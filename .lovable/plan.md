

Phase 3 is complete (Lead Cockpit, Discipline Rules, Account Lifecycle with tabbed cockpit + Notes/Activity). The original 4-phase plan defined Phase 4 as the final wrap-up. Plus we have Phase 2 leftover (Saved Views) still deferred.

# Phase 4 — Conversion Continuity, Opportunities, Saved Views & Polish

This is the final phase. It closes the Lead → Account → Opportunity loop, finishes the Phase 2 deferral, and adds the operational polish needed to call the upgrade enterprise-grade.

## 4A. Opportunities (first-class)

The `opportunities` table already exists but isn't wired up. Promote it to a real module.

**Edge function** `supabase/functions/opportunities/index.ts` (new):
- `list` (scoped via `has_leads_access_scoped` on `owner`)
- `create_opportunity`, `update_opportunity`, `delete_opportunity` (soft delete)
- `change_stage` (stages: `prospecting | qualification | proposal | negotiation | won | lost`)
- Auto-recompute `weighted_forecast = estimated_value * probability_percent / 100`
- Audit logging on every mutation

**Convert flow upgrade** — `ConvertLeadDialog.tsx` + `leads/index.ts` `convert_lead` action:
- When converting a won lead, also create an `opportunities` row linked to the new account/contact (`source_lead_id`, `account_id`, `contact_id`, copied value/probability/close date)
- Lead's `converted_to_id` already covers the account; opportunity is the third leg

**UI**:
- New page `src/pages/OpportunitiesPage.tsx` — table view with stage, value, weighted forecast, owner, expected close, account link
- Add "Opportunities" tab content in `AccountDetailSheet` (currently placeholder) — list opportunities filtered by `account_id`
- Sidebar nav entry under CRM section
- New components: `AddOpportunityDialog.tsx`, `OpportunityDetailSheet.tsx`

## 4B. Saved Views (Phase 2 leftover)

**Migration**: `lead_saved_views` table
- `id`, `name`, `owner_id`, `filters jsonb`, `is_shared bool`, `is_default bool`, `created_at`
- RLS: SELECT own + shared; INSERT/UPDATE/DELETE own only via edge function

**Edge function** extension to `leads/index.ts`: `list_saved_views`, `save_view`, `delete_saved_view`, `set_default_view`

**UI** — extend `LeadsFilterBar.tsx`:
- "Views" dropdown next to filters: list user's saved + shared views
- "Save current view" → name + share toggle
- "Set as default" → auto-applies on page load if no URL filters present
- Star icon for default, share icon for team-visible

## 4C. Account/Contact Polish

- Surface `account_health` and `account_status` as colored badges on the `AccountsContactsPage` table
- Add filter bar on Accounts page (mirror of Leads): owner, country, industry, status, type, health, search — URL-synced via the same pattern as `LeadsFilterBar`
- New `AccountsFilterBar.tsx` component
- Wire the existing `attachments` system into a "Documents" tab on `AccountDetailSheet` using `entity_type='account'` (component already exists: `FileAttachmentList` + `FileUploadButton`)

## 4D. Filter-aware Export & Final Polish

- CSV export on Leads page respects current filter state (currently exports all visible). Filename includes a short filter summary, e.g. `leads_qualified_LB_2026-04-17.csv`
- Add same CSV export to Accounts page
- Add a "Recompute scores" admin button on Leads page (the `useRecomputeAllLeadScores` hook already exists from Phase 1, just needs a UI affordance gated to admin role)

## File Impact

**New (~8)**:
- `supabase/functions/opportunities/index.ts`
- `src/pages/OpportunitiesPage.tsx`, `src/hooks/useOpportunities.ts`
- `src/components/opportunities/AddOpportunityDialog.tsx`, `OpportunityDetailSheet.tsx`
- `src/components/accounts/AccountsFilterBar.tsx`
- `src/components/leads/SavedViewsMenu.tsx`
- 1 migration (`lead_saved_views` table + RLS)

**Edited (~9)**:
- `supabase/functions/leads/index.ts` (saved views actions + convert_lead opportunity insert)
- `src/components/leads/ConvertLeadDialog.tsx`, `LeadsFilterBar.tsx`, `LeadsPage.tsx` (CSV export)
- `src/components/accounts/AccountDetailSheet.tsx` (Opportunities + Documents tabs)
- `src/pages/AccountsContactsPage.tsx` (filter bar + badges + CSV)
- `src/hooks/useAccountsContacts.ts` (filter param), `src/hooks/useLeads.ts` (saved views hooks)
- `src/App.tsx` + `src/config/navigation.ts` (Opportunities route + nav)

**Migration (1)**: `lead_saved_views` with RLS

## Execution order in the next turn

1. Migration (saved views) → wait for approval
2. Opportunities edge function + hooks + page + dialogs
3. Wire ConvertLeadDialog to also create opportunity
4. Saved Views UI on LeadsFilterBar
5. AccountsFilterBar + status/health badges + Documents tab
6. Filter-aware CSV exports + admin recompute button

After this phase the system has: structured geography, full Account CRUD with lifecycle + notes/activity, server-side filters with shareable URLs and saved presets, lead cockpit with risk flags, discipline-enforced stage transitions, and the full Lead → Account → Opportunity continuity loop.




# Browser Tab Notification Count + Leads Management Module

## 1. Browser Tab Notification Count

Update `document.title` reactively based on unread count in `TopBar.tsx`. When unread > 0, prefix the title with `(N)`, e.g. `(3) CIEL CRM`. Reset when count is 0.

**File**: `src/components/layout/TopBar.tsx` — add a `useEffect` that sets `document.title` based on `unreadCount`.

## 2. Leads Management Module

A full CRM leads feature restricted to `chairman`, `vice_president`, and `head_of_operations`.

### Database Tables (2 new tables via migration)

**`leads`** table:
- `id` (uuid, PK)
- `company_name` (text)
- `contact_name` (text)
- `contact_email` (text, nullable)
- `contact_phone` (text, nullable)
- `status` (text: `potential`, `active`, `inactive`, `lost`) — default `potential`
- `source` (text, nullable) — how they found us
- `notes` (text, nullable)
- `created_by` (text) — user_id
- `assigned_to` (text, nullable) — user_id
- `deleted_at` (timestamptz, nullable) — soft delete
- `created_at`, `updated_at` (timestamptz)

**`lead_services`** table:
- `id` (uuid, PK)
- `lead_id` (uuid, FK → leads)
- `service_name` (text)
- `description` (text, nullable)
- `start_date` (date, nullable)
- `expiry_date` (date) — drives expiry notifications
- `status` (text: `active`, `expired`, `renewed`) — default `active`
- `deleted_at` (timestamptz, nullable)
- `created_at` (timestamptz)

RLS: service_role full access; SELECT for anon/authenticated where `deleted_at IS NULL`.

### Edge Function: `leads`

Actions: `list`, `get`, `create`, `update`, `delete` (soft), plus `list_services`, `add_service`, `update_service`, `delete_service` (soft).

Server-side role guard: only `chairman`, `vice_president`, `head_of_operations` can invoke.

### Edge Function: `leads-expiry-check` (scheduled)

A cron job (daily) that queries `lead_services` for services expiring in 60, 30, 15, 7, 3, 1 days. For each match, inserts a notification for each allowed user and broadcasts via `user-notify-{userId}`. Notification type: `lead_expiry` — plays the notification sound.

Scheduled via `pg_cron` + `pg_net`.

### Frontend Pages & Components

**New files**:
- `src/pages/LeadsPage.tsx` — main page with tabs: All Leads, Potential, Active, Inactive
- `src/components/leads/LeadsTable.tsx` — sortable/filterable table of leads
- `src/components/leads/LeadDetailSheet.tsx` — slide-over with lead info + services list
- `src/components/leads/AddLeadDialog.tsx` — form: company, contact, status, source, notes
- `src/components/leads/EditLeadDialog.tsx` — edit existing lead
- `src/components/leads/AddServiceDialog.tsx` — add service/solution to a lead with expiry date
- `src/components/leads/LeadStatsCards.tsx` — summary cards: total leads, active services, expiring soon count
- `src/hooks/useLeads.ts` — queries and mutations for leads + services

**Routing** (`src/App.tsx`):
- Add `/leads` route wrapped in `ProtectedRoute` with `allowedRoles={LEADS_ROLES}`

**Navigation** (`src/config/navigation.ts`):
- Add "Leads" item under Organization group with `allowedRoles: ['chairman', 'vice_president', 'head_of_operations']`

**Notification sound mapping** (`src/hooks/useNotifications.ts`):
- Add `lead_expiry` type → plays notification sound (with urgent flag for 1-day and 3-day warnings)

### Stats & Features on Leads Page

- **Stats cards**: Total Leads, Active Services, Expiring in 30 days, Lost Leads
- **Lead detail sheet**: Full contact info, list of services with status badges and expiry countdown
- **Service expiry badges**: Color-coded (green = >60d, yellow = 30-60d, orange = 7-30d, red = <7d)
- **Bulk actions**: Soft-delete multiple leads
- **Search & filter**: By status, company name, expiry range

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/layout/TopBar.tsx` | Add `useEffect` for `document.title` |
| `supabase/migrations/new.sql` | Create `leads` + `lead_services` tables with RLS |
| `supabase/functions/leads/index.ts` | New — CRUD for leads and services |
| `supabase/functions/leads-expiry-check/index.ts` | New — scheduled expiry notification sender |
| `src/pages/LeadsPage.tsx` | New — main leads page |
| `src/components/leads/LeadsTable.tsx` | New |
| `src/components/leads/LeadDetailSheet.tsx` | New |
| `src/components/leads/AddLeadDialog.tsx` | New |
| `src/components/leads/EditLeadDialog.tsx` | New |
| `src/components/leads/AddServiceDialog.tsx` | New |
| `src/components/leads/LeadStatsCards.tsx` | New |
| `src/hooks/useLeads.ts` | New |
| `src/hooks/useNotifications.ts` | Add `lead_expiry` sound mapping |
| `src/config/navigation.ts` | Add Leads nav item |
| `src/types/roles.ts` | Add `LEADS_ROLES` constant |
| `src/App.tsx` | Add `/leads` route |


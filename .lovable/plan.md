

# Final Corrected Phase 1 Plan — Enterprise Leads Module

## Corrections Applied

### 1. Identity Model: Auth0 Subject Strings (Confirmed)

Auth0 `sub` strings are the canonical identity model across the entire CRM. All existing identity columns (`user_id`, `created_by`, `assigned_to`, `actor_id`, `author_id`) store Auth0 sub strings as `text`. No `_sub` suffix is used anywhere in the existing schema.

**Decision**: New fields will follow the same convention — `assigned_by text` (not `assigned_by_sub`). This keeps consistency. All identity fields are Auth0 subject strings by convention, documented but not renamed.

### 2. Scoped Access for Head of Operations

The edge function already gates all access server-side via `service_role` client. RLS is defense-in-depth. The scoping logic will be:

- **Chairman / Vice President**: See all leads (no filter).
- **Head of Operations**: See only leads where `assigned_to` is themselves OR is a member of their team(s). The edge function will query `team_members` to get the user's team, then filter leads by `assigned_to IN (team member user_ids)`.

This scoping happens in the edge function (primary gate), with RLS as backup using a `has_leads_access_scoped` security definer function that implements the same logic.

### 3. RLS: Remove `anon`, Authenticated Only

All CRM-internal tables (`leads`, `lead_services`, `lead_activities`, `lead_notes`) will have SELECT policies restricted to `authenticated` role only. The `anon` role will be removed from read policies on these tables.

### 4. Lead Scoring: Provisional UI-Only

Score and score_band will NOT be stored in the database in Phase 1. They will be computed client-side for display purposes only (badges, sorting in the UI). No DB columns for `score`/`score_band`. This prevents client-side logic from becoming authoritative. Backend scoring will be added in a later phase.

---

## Database Migration

### Enums

```sql
CREATE TYPE public.lead_stage AS ENUM (
  'new','contacted','qualified','proposal','negotiation','won','lost'
);
CREATE TYPE public.lead_lost_reason AS ENUM (
  'competitor','price_issue','no_response','timing',
  'budget','invalid','duplicate','deprioritized','other'
);
```

### ALTER `leads` table

```sql
ALTER TABLE leads
  ADD COLUMN stage lead_stage NOT NULL DEFAULT 'new',
  ADD COLUMN estimated_value numeric,
  ADD COLUMN currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN probability_percent integer NOT NULL DEFAULT 0
    CHECK (probability_percent BETWEEN 0 AND 100),
  ADD COLUMN weighted_forecast numeric
    GENERATED ALWAYS AS (
      COALESCE(estimated_value,0) * probability_percent / 100.0
    ) STORED,
  ADD COLUMN expected_close_date date,
  ADD COLUMN next_follow_up_at timestamptz,
  ADD COLUMN last_contacted_at timestamptz,
  ADD COLUMN industry text,
  ADD COLUMN website text,
  ADD COLUMN secondary_phone text,
  ADD COLUMN city text,
  ADD COLUMN country text,
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN lost_reason_code lead_lost_reason,
  ADD COLUMN lost_notes text,
  ADD COLUMN assigned_by text,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN normalized_company text GENERATED ALWAYS AS (
    lower(trim(regexp_replace(company_name,'\s+',' ','g')))
  ) STORED,
  ADD COLUMN normalized_email text GENERATED ALWAYS AS (
    lower(trim(COALESCE(contact_email,'')))
  ) STORED,
  ADD COLUMN normalized_phone text GENERATED ALWAYS AS (
    regexp_replace(COALESCE(contact_phone,''),'[^0-9+]','','g')
  ) STORED,
  ADD COLUMN converted_at timestamptz,
  ADD COLUMN converted_to_type text,
  ADD COLUMN converted_to_id uuid;
```

No `score`/`score_band` columns — scoring is UI-only in Phase 1.

### Indexes

```sql
CREATE INDEX idx_leads_stage ON leads(stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_created_at ON leads(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_next_follow_up ON leads(next_follow_up_at) WHERE deleted_at IS NULL AND next_follow_up_at IS NOT NULL;
CREATE INDEX idx_leads_expected_close ON leads(expected_close_date) WHERE deleted_at IS NULL AND expected_close_date IS NOT NULL;
CREATE INDEX idx_leads_norm_email ON leads(normalized_email) WHERE deleted_at IS NULL AND normalized_email != '';
CREATE INDEX idx_leads_norm_phone ON leads(normalized_phone) WHERE deleted_at IS NULL AND normalized_phone != '';
CREATE INDEX idx_leads_norm_company ON leads(normalized_company) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_tags ON leads USING gin(tags) WHERE deleted_at IS NULL;
```

### New tables

**`lead_activities`** — structured audit trail:

```sql
CREATE TABLE lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  actor_id text NOT NULL,        -- Auth0 sub (consistent with existing convention)
  activity_type text NOT NULL,   -- stage_change, owner_change, note_added, created, lost, reopened, value_change
  title text NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}',   -- { "stage": {"old":"new","new":"qualified"}, ... }
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_activities_lead ON lead_activities(lead_id, created_at DESC);
```

**`lead_notes`**:

```sql
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  author_id text NOT NULL,       -- Auth0 sub (consistent with existing convention)
  note_type text NOT NULL DEFAULT 'general'
    CHECK (note_type IN ('general','call_log','email_log','meeting_log','follow_up')),
  content text NOT NULL,
  outcome text,
  next_step text,
  contact_date timestamptz,
  duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_lead_notes_lead ON lead_notes(lead_id, created_at DESC);
```

### RLS — Scoped, Authenticated-Only

**Security definer function for scoped access:**

```sql
CREATE OR REPLACE FUNCTION public.has_leads_access_scoped(_user_id text, _lead_assigned_to text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role IN ('chairman', 'vice_president')
  )
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role = 'head_of_operations'
      AND (
        _lead_assigned_to = _user_id
        OR _lead_assigned_to IN (
          SELECT tm.user_id FROM team_members tm
          WHERE tm.team_id IN (
            SELECT tm2.team_id FROM team_members tm2 WHERE tm2.user_id = _user_id
          )
        )
      )
  )
$$;
```

**Update leads RLS** — drop existing anon policy, add authenticated-only scoped policy:

```sql
DROP POLICY IF EXISTS "Users can read active leads" ON leads;
CREATE POLICY "Authenticated scoped read leads" ON leads
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.has_leads_access_scoped(
      (current_setting('request.headers',true)::json->>'x-auth0-sub'),
      assigned_to
    )
  );
```

**Update lead_services RLS** — authenticated only, inherit parent lead access:

```sql
DROP POLICY IF EXISTS "Users can read active lead_services" ON lead_services;
CREATE POLICY "Authenticated scoped read lead_services" ON lead_services
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_services.lead_id
        AND leads.deleted_at IS NULL
        AND public.has_leads_access_scoped(
          (current_setting('request.headers',true)::json->>'x-auth0-sub'),
          leads.assigned_to
        )
    )
  );
```

**lead_activities and lead_notes RLS** — authenticated only, inherit parent:

```sql
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages lead_activities" ON lead_activities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read lead_activities" ON lead_activities FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM leads WHERE leads.id = lead_activities.lead_id AND leads.deleted_at IS NULL
    AND public.has_leads_access_scoped(
      (current_setting('request.headers',true)::json->>'x-auth0-sub'), leads.assigned_to)
  ));

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages lead_notes" ON lead_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read lead_notes" ON lead_notes FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM leads WHERE leads.id = lead_notes.lead_id AND leads.deleted_at IS NULL
    AND public.has_leads_access_scoped(
      (current_setting('request.headers',true)::json->>'x-auth0-sub'), leads.assigned_to)
  ));
```

---

## Edge Function Rewrite (`leads/index.ts`)

All data access uses `service_role` client (bypasses RLS). Role + scope checks done in code:

- **Chairman/VP**: no lead filtering
- **Head of Operations**: query `team_members` for actor's team, filter leads by `assigned_to IN (team_user_ids)`

New/updated actions:
- **`create`**: accepts all new fields (stage, estimated_value, currency, probability_percent, expected_close_date, industry, website, secondary_phone, city, country, tags, next_follow_up_at, assigned_to, assigned_by). Logs `lead_activities` entry with `activity_type: 'created'`.
- **`update`**: detects changed fields, logs structured `changes` JSONB to `lead_activities` (e.g., `{ "stage": { "old": "new", "new": "qualified" } }`).
- **`change_stage`**: validates against enum values. If target is `lost`, requires `lost_reason_code`. Logs activity with old/new.
- **`assign_owner`**: updates `assigned_to`, `assigned_by`, `assigned_at`. Logs activity.
- **`mark_lost`**: requires `lost_reason_code` (validated against enum). Sets stage to `lost`. Logs activity.
- **`reopen`**: changes stage from `lost` to chosen stage. Clears `lost_reason_code`/`lost_notes`. Logs activity.
- **`add_note`**: inserts into `lead_notes` + logs to `lead_activities`.
- **`list_activities`**: returns timeline for a lead.
- **`list_notes`**: returns notes for a lead.
- **`check_duplicates`**: queries using `normalized_company`, `normalized_email`, `normalized_phone` with similarity matching.
- **`stats`**: adds `pipeline_value` (SUM weighted_forecast by stage), `overdue_follow_ups` count, per-stage counts, won/lost counts.

---

## Frontend Changes

### Hooks (`useLeads.ts`)
- Update `Lead` interface with all new DB fields (stage, estimated_value, weighted_forecast, probability_percent, etc.)
- Add `LeadActivity` and `LeadNote` interfaces
- New hooks: `useLeadActivities`, `useLeadNotes`, `useAddNote`, `useChangeStage`, `useAssignOwner`, `useMarkLost`, `useReopenLead`, `useCheckDuplicates`
- Update `LeadStats` with pipeline_value, weighted_forecast, overdue_follow_ups, per-stage counts
- Add `computeLeadScore(lead): { score: number; band: 'hot'|'warm'|'cold' }` as a **pure utility function** (not stored, not exported for reporting — UI display only, clearly documented as provisional)

### AddLeadDialog — Full Redesign
- `max-w-3xl`, 3 sections: Company Info, Contact, Deal Intelligence
- Fields: company, industry, website, country, city, source | name, email, phone, secondary_phone | stage, estimated_value, currency, probability, expected_close_date, assigned_to (owner picker), next_follow_up_at, tags, notes, solutions
- Duplicate check on blur (company/email/phone) via `check_duplicates` — shows warning banner

### EditLeadDialog — Same Sectioned Layout
- Pre-populated, loads existing services
- Stage change dropdown; if changing to `lost`, opens LostReasonDialog

### LeadsTable Enhancements
- New columns: Stage (badge + inline dropdown), Owner (avatar/initials), Est. Value, Weighted Forecast, Next Follow-up (overdue badge), Last Activity
- Keep expandable services sub-table

### LeadDetailSheet — Extensible Tab Architecture
- `max-w-4xl` sheet with generic tab system (array of `{ key, label, component }`)
- Phase 1 tabs: **Overview** (contact card, deal summary with weighted_forecast from DB, stage indicator, services), **Activity** (chronological timeline from lead_activities with structured old→new display), **Notes** (list + add form with type/outcome)
- Placeholder tabs: Tasks, Files, Quotes — empty states, ready for Phase 2/3 without restructuring

### New Components
- **`LostReasonDialog.tsx`**: Modal with `lost_reason_code` dropdown (from enum values) + optional `lost_notes` textarea
- **`LeadActivityTimeline.tsx`**: Renders activities with actor avatar, structured field changes (old → new), timestamps
- **`LeadNotesPanel.tsx`**: Notes list + add form with type selector, outcome, duration

### LeadStatsCards — 8 Metrics
Row 1: Total Leads, Active Pipeline, Qualified, Won
Row 2: Pipeline Value, Weighted Forecast, Overdue Follow-ups, Expiring Services (7d)

### LeadsPage Updates
- Smart summary cards (Overdue Follow-ups, Due Today, No Activity 7+d, Closing This Month)
- Enhanced filter bar
- Provisional score badges (clearly UI-only, not in exports)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Enums, ALTER leads, CREATE lead_activities + lead_notes, indexes, scoped RLS functions + policies |
| `supabase/functions/leads/index.ts` | Major rewrite with scope filtering, 8+ new actions, structured activity logging |
| `src/hooks/useLeads.ts` | New interfaces, hooks, provisional `computeLeadScore` utility |
| `src/components/leads/AddLeadDialog.tsx` | Full redesign with sections + duplicate check |
| `src/components/leads/EditLeadDialog.tsx` | Matching sectioned layout |
| `src/components/leads/LeadsTable.tsx` | New columns, inline stage change, owner avatars, overdue badges |
| `src/components/leads/LeadDetailSheet.tsx` | Extensible tab architecture |
| `src/components/leads/LostReasonDialog.tsx` | New |
| `src/components/leads/LeadActivityTimeline.tsx` | New |
| `src/components/leads/LeadNotesPanel.tsx` | New |
| `src/components/leads/LeadStatsCards.tsx` | 8 metrics |
| `src/pages/LeadsPage.tsx` | Smart cards, enhanced filters |


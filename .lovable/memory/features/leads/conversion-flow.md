---
name: Lead Conversion Flow
description: Won leads convert to Account/Contact/Opportunity with reversible soft-delete and audit trail
type: feature
---
Won leads can be converted into Account + Contact + Opportunity entities. Conversion is reversible (soft-deletes created entities, clears lead metadata). All operations go through the `leads` edge function (`convert` / `unconvert` actions) with full audit logging. Tables: `accounts`, `contacts`, `opportunities` — all use Auth0 sub strings for owner/created_by, RLS scoped via `has_leads_access_scoped`, and `service_role` for writes.
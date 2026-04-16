# Project Memory

## Core
React frontend, Supabase backend, Auth0 Passkeys. Zero-trust identity via JWT 'sub' claim.
Professional enterprise aesthetic. Blue primary palette, Inter font, clean dashboard shell.
Strict type safety (@typescript-eslint/no-explicit-any). Explicit 'any' forbidden. Use specific row interfaces.
All data mutations via Supabase Edge Functions. Server-side authorization using JWT 'sub' required before service role writes.
Strict RBAC. Audit logging mandatory for all critical actions. Universal soft-delete (deleted_at) support.
Defense-in-depth: RLS enabled on all tables. 'anon' SELECT allowed only for profiles, user_roles, teams, team_members.
Query stability: Avoid raw PostgREST '.or()' with Auth0 IDs (uses '|'). Use multiple '.in()' or in-memory equality checks.
Security hardening: Strict rate limiting, server-side text sanitization, and strict file upload validation.

## Memories
- [Project Overview](mem://project/overview) — CIEL Internal CRM Phase 2 enterprise platform specs
- [Login Flow](mem://auth/login-flow) — Two-step verification, Auth0 Passkey flow, and client-side rate limits
- [User Provisioning](mem://auth/user-provisioning) — Pending user flow synced via sync-profile Edge Function on first login
- [Automated Triggers](mem://features/notifications/automated-triggers) — In-app notification triggers and click-through navigation rules
- [Calendar Aggregation](mem://features/calendar/aggregation) — Unified view rules for Tasks and Leaves data
- [Dashboard Tiering](mem://architecture/dashboard-tiering) — Centralized tiered role visibility via dashboard-stats Edge Function
- [Error Resilience](mem://architecture/error-resilience) — Global ErrorBoundary and PageError recovery components
- [Admin Console](mem://features/admin/console) — Role-restricted administrative provisioning and audit logging
- [Meetings Requirements](mem://features/meetings/requirements) — Google FreeBusy integration and hard-block override rules
- [Tasks Real-Time](mem://features/tasks/real-time) — Supabase Realtime cache invalidation for task updates
- [Task Collaboration](mem://features/tasks/collaboration) — Threaded task comments and automated activity logging
- [Task Activity Logging](mem://features/tasks/activity-logging) — State transition and timestamp history tracking
- [Alert System](mem://features/notifications/alert-system) — Synthesized multi-channel audio cues and URL-aware suppression
- [Task Reassignment](mem://features/tasks/reassignment-logic) — Reassignment workflow, metadata clearing, and notifications
- [Attachment Security](mem://features/attachments/security-policy) — Restrictions, private buckets, and blob-based signed URL downloads
- [Real-Time Messaging](mem://features/messaging/real-time-architecture) — Zero-latency chat, typing indicators, and global presence
- [Task Workflow](mem://features/tasks/workflow) — Database lifecycle constraints and operational timestamp tracking
- [Task Assignment Rules](mem://features/tasks/assignment-ui) — Cross-department assignment logic and permissions by role
- [Task Persistence](mem://features/tasks/filters-sorting) — Database persistence for pinned states and customized sort orders
- [Real-Time Notifications](mem://architecture/real-time-notifications) — Supabase Broadcast channels replacing postgres_changes for auth reliability
- [Expiry Automation](mem://features/leads/expiry-automation) — Daily automated service expiration notifications via cron
- [Enterprise CRM Rules](mem://features/leads/enterprise-crm) — Lead stages and weighted forecasting business logic
- [Security Scoping](mem://features/leads/security-scoping) — CRM ownership rules enforced via RLS and Edge Functions
- [Activity Audit](mem://features/leads/activity-audit) — JSONB field-level tracking and structured CRM interaction logs
- [Data Integrity](mem://features/leads/data-integrity) — Postgres enums and normalized generated columns for lead deduplication
- [Portfolio Tracking](mem://features/leads/portfolio-tracking) — Sub-table solution tracking with individual start/expiry dates
- [Lead Conversion](mem://features/leads/conversion-flow) — Won leads convert to Account/Contact/Opportunity with reversible soft-delete and audit trail
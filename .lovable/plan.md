

# Enhance Notification Sounds + Enterprise Leads Page

## 1. Notification sounds play over music/media

**Problem**: The Web Audio API `AudioContext` connects to `ctx.destination` which is the same audio output as media players. However, the sounds already use separate oscillator nodes so they should mix with music. The real issue is that `AudioContext` may be suspended and `resume()` is async but we don't await it.

**Fix** in `src/lib/notifications.ts`:
- `await ctx.resume()` before scheduling oscillators (make all play functions async)
- Set higher gain values (0.35-0.5 instead of 0.12-0.18) so sounds are audible over music
- Use a `DynamicsCompressorNode` between gain and destination to ensure the notification punches through

No changes needed in callers since they don't await the sound functions anyway.

## 2. Deeper Lead Services / Solutions Display

Currently services are only visible inside the `LeadDetailSheet` slide-over. The user wants each lead's purchased solutions (SSL, Digital Certificate, etc.) visible directly, with validity and expiry dates and per-solution expiry alerts.

**Changes**:

### LeadsTable.tsx — Show services inline
- Add an expandable row or a "solutions" column showing service count + nearest expiry badge
- When a lead row is expanded, show a sub-table of all services with: service name, start date, expiry date, status, days-left badge

### LeadDetailSheet.tsx — Make it a full-page-width sheet
- Expand to `sm:max-w-2xl`
- Add a **Services Portfolio** section with:
  - Each service as a card showing: service name, description, start/expiry dates, countdown badge, status toggle, edit/delete actions
  - Visual timeline bar showing validity period
  - "Renew" quick action button (sets status to `renewed` and opens date picker for new expiry)

### AddServiceDialog.tsx — Enhance
- Add a predefined service type dropdown (SSL, Digital Certificate, Digital Signature, ACME, Custom) alongside the free-text field
- Add contract value / amount field (optional, for stats)

## 3. Enterprise-Level Leads Page Enhancements

### New components and features:

**LeadsPage.tsx — Complete redesign**:
- Header with title, lead count, "New Lead" and "Export" buttons
- Enhanced stats row with 6 cards: Total Leads, Active Clients, Total Services, Expiring in 30d, Expiring in 7d, Revenue at Risk
- Two view modes: Table view and Card/Grid view (toggle)
- Advanced filters bar: status, source, expiry range, search
- Pagination for large datasets

**LeadStatsCards.tsx — Expand to 6 metrics**:
- Total Leads, Active Clients, Potential Leads, Total Active Services, Expiring in 30 Days, Expiring in 7 Days
- Add `stats` action in edge function to return additional counts (potential, total_services, expiring_7)

**New: LeadServicesSummary component** (inline in table):
- Shows service pills/chips for each lead row with color-coded expiry status
- Hoverable to see expiry date details

**LeadDetailSheet.tsx — Enterprise upgrade**:
- Full contact card with all details
- Services section with individual service cards (not just a table)
- Each service card: name, description, start date, expiry date, countdown timer, status badge, renewal button
- Activity timeline placeholder (future: track when services were added/renewed)
- "Total Services" and "At Risk" counters at the top of services section

### Edge function updates (`leads/index.ts`):
- Enhanced `stats` action: add `potential`, `total_services`, `expiring_7` counts
- New `lead_with_services` action: returns a lead with all its services in one call (reduce round trips)

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/lib/notifications.ts` | Await resume, boost gain, add compressor for sound-over-music |
| `src/pages/LeadsPage.tsx` | Enterprise layout with filters, view toggle, pagination, export |
| `src/components/leads/LeadStatsCards.tsx` | 6 stat cards instead of 4 |
| `src/components/leads/LeadsTable.tsx` | Expandable rows showing services inline with expiry badges |
| `src/components/leads/LeadDetailSheet.tsx` | Wider sheet, service cards with renewal, countdown timers |
| `src/components/leads/AddServiceDialog.tsx` | Predefined service types dropdown |
| `src/hooks/useLeads.ts` | Add `useLeadWithServices` hook, update stats type |
| `supabase/functions/leads/index.ts` | Enhanced stats, `lead_with_services` action |


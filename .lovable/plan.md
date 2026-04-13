

# Fix Lead Service Fields + Message Attachment Downloads

## Issue 1: Lead dialogs missing service/solution fields

**Problem**: `AddLeadDialog` and `EditLeadDialog` only capture lead info (company, contact, status). There's no way to add solutions with expiry dates during lead creation or editing. The `AddServiceDialog` exists but is only accessible from the detail sheet after the lead is already created.

**Fix**: Add an inline "Solutions" section to both dialogs allowing users to add multiple services, each with a name (from predefined types), start date, and expiry date — all in one form submission.

### AddLeadDialog changes:
- Widen dialog to `max-w-2xl`
- Add a "Solutions" section below notes with an "Add Solution" button
- Each solution row: service type dropdown, custom name (if Custom), start date, expiry date, remove button
- On submit: create lead first, then bulk-add services via `useAddService` mutations
- Store solutions in local state as an array

### EditLeadDialog changes:
- Widen dialog to `max-w-2xl`
- Load existing services via `useLeadServices(lead.id)` and display them
- Allow adding new solutions, editing existing ones, removing solutions
- On submit: update lead info, then add new / update changed / delete removed services

## Issue 2: Message attachments not downloadable

**Two sub-problems**:

**A) Attachments never fetched**: In `MessagesPage.tsx`, `useAttachments` is called with `entity_id: null` (line 64), so it's always disabled. The `messageAttachments` prop is never passed to `MessageThread`.

**Fix**: After messages load, fetch all attachments for those message IDs. The edge function lists by `entity_type` + `entity_id`, so we need to either:
- Batch-fetch: add a new `list_by_ids` action to the attachments edge function that accepts multiple entity_ids
- Or: use the conversation_id as entity context — simpler: add a `list_by_conversation` action

Simplest approach: add a `list_by_entity_ids` action to the attachments edge function that accepts `entity_type` + `entity_ids[]` and returns all matching attachments grouped by entity_id.

**B) Cross-origin download broken**: The download link uses `<a href={att.url} download target="_blank">`. For cross-origin Supabase signed URLs, the `download` attribute is ignored by browsers — the file opens in a new tab instead of downloading.

**Fix**: Replace the `<a>` download link with a blob-based download function: fetch the URL as a blob, create an object URL, trigger download via a temporary anchor element.

## Files to modify

| File | Change |
|------|--------|
| `src/components/leads/AddLeadDialog.tsx` | Add inline solutions section with add/remove rows |
| `src/components/leads/EditLeadDialog.tsx` | Load existing services, allow add/edit/remove inline |
| `src/pages/MessagesPage.tsx` | Fix attachment fetching — pass message IDs, pass `messageAttachments` to `MessageThread` |
| `src/hooks/useAttachments.ts` | Add `useAttachmentsByEntityIds` hook + `list_by_entity_ids` action |
| `supabase/functions/attachments/index.ts` | Add `list_by_entity_ids` action |
| `src/components/shared/FileAttachmentList.tsx` | Replace `<a>` download with blob-based download function |




# Fix: Profile Status Not Updating to "Active" on Login

## Problem
When users log in via Auth0, the `sync-profile` edge function updates their profile (display_name, avatar_url, etc.) but never sets `status: 'active'`. Users pre-provisioned with `status: 'pending'` remain "pending" forever.

## Root Cause
In `supabase/functions/sync-profile/index.ts`, all three update/upsert paths omit the `status` field:
- Line 52-62: existing profile update — no `status`
- Line 76-88: pending profile linking — no `status`
- Line 97-108: new profile upsert — no `status`

## Fix
Add `status: 'active'` to every update/upsert call in the sync-profile function:

1. **Existing profile update** (line 54): add `status: 'active'`
2. **Pending profile linking** (line 78): add `status: 'active'`
3. **New profile upsert** (line 99): add `status: 'active'`

This ensures that any user who successfully authenticates through Auth0 is automatically marked as active. Three lines changed in one file.


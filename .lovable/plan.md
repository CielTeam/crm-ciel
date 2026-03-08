

# Fix: profiles_status_check constraint violation

The `profiles_status_check` constraint only allows `('active', 'suspended', 'deleted')`, but the `admin-manage-user` edge function inserts new users with `status: 'pending'`.

## Fix

**Option A (recommended):** Add `'pending'` to the check constraint via a migration:
```sql
ALTER TABLE profiles DROP CONSTRAINT profiles_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'suspended', 'deleted', 'pending'));
```

This is the correct fix because the existing seeded user (`boutros.georges513@gmail.com`) was also inserted with `'pending'` status, confirming the design intent for pre-provisioned users who haven't logged in yet.

No edge function or frontend changes needed.


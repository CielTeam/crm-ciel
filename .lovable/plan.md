

# Login Flow: Email Verification + Seed User

## Overview
Modify the login page to add an email verification step before allowing passkey login. The user enters their email, which is checked against the `profiles` table. Only if the email exists can they proceed to Auth0 passkey authentication. Also seed a specific user into the database.

## Data Seeding
Insert into the database via the insert tool:
1. **Profile** for `boutros.georges513@gmail.com` with display name and status active
2. **User role** `team_development_lead` for this user

Since we don't have the Auth0 `sub` ID yet (the user hasn't logged in via Auth0), we'll use the email as the temporary `user_id` identifier. When the user first logs in via Auth0, the `sync-profile` function will create a new profile with the Auth0 `sub`. We need a way to link them.

**Better approach:** Create a new edge function `verify-email` that checks if an email exists in the `profiles` table (no auth required, just checks existence). Seed the profile with a placeholder `user_id` like `pending|boutros.georges513@gmail.com`. Then update `sync-profile` to link by email if a pending profile exists.

## Changes

### 1. New Edge Function: `verify-email`
- Accepts `{ email: string }`
- No auth required (pre-login check)
- Queries `profiles` table for matching email where `deleted_at IS NULL`
- Returns `{ exists: boolean }`

### 2. Update Edge Function: `sync-profile`
- After Auth0 login, if no profile found by `user_id`, check for a profile matching the email with a `pending|` prefix in `user_id`
- If found, update that profile's `user_id` to the real Auth0 `sub`
- This links pre-seeded users to their Auth0 accounts on first login

### 3. Update Login Page (`src/pages/LoginPage.tsx`)
- Add email input field (step 1)
- On submit, call `verify-email` edge function
- If email exists → show "Sign in with Passkey" button (step 2)
- If not → show error "No account found. Contact your administrator."
- Pass `login_hint` email to Auth0 via `loginWithRedirect({ authorizationParams: { login_hint: email } })`

### 4. Update Auth Context
- Modify `login` function to accept optional `login_hint` parameter
- Pass it through to `loginWithRedirect`

### 5. Seed Data
Insert via the data tool:
- Profile: `user_id = 'pending|boutros.georges513@gmail.com'`, email = `boutros.georges513@gmail.com`, display_name = `Boutros Georges`, status = `active`
- User role: `user_id = 'pending|boutros.georges513@gmail.com'`, role = `team_development_lead`

### 6. Supabase Config
Add `verify-email` function config to `supabase/config.toml` with `verify_jwt = false` since it's called before authentication.

## Login Flow Diagram
```text
[Enter Email] → verify-email → exists?
   ├─ YES → [Show Passkey Button] → Auth0 login → sync-profile (links pending profile) → Dashboard
   └─ NO  → "No account found"
```


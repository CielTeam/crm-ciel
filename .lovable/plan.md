

# Fix Auth0 Audience Configuration

## Problem
The Auth0 `audience` is set to the API **name** (`'CIEL Internal CRM API'`) instead of the API **Identifier** (URL). Auth0 requires the Identifier value.

## Change

**`src/App.tsx` line 46**: Replace `'CIEL Internal CRM API'` with `'https://crm-ciel.lovable.app/api'`.

**Edge Functions**: The 9 edge functions read `AUTH0_AUDIENCE` from environment. The Supabase secret `AUTH0_AUDIENCE` must also be updated to `https://crm-ciel.lovable.app/api`. This requires updating the secret via the secrets tool.

| Location | Current | New |
|----------|---------|-----|
| `src/App.tsx` line 46 | `'CIEL Internal CRM API'` | `'https://crm-ciel.lovable.app/api'` |
| Supabase secret `AUTH0_AUDIENCE` | `CIEL Internal CRM API` | `https://crm-ciel.lovable.app/api` |

No other frontend files reference the audience string directly — hooks use `getToken()` which inherits from the provider config.


# Resolving the reported API errors

Read-only checks confirmed the configured project accepts the public key and has email/password signup enabled. Email confirmation is required. However, Supabase REST returned `PGRST205` for both `public.categories` and `public.users`: these tables are not available in the API schema cache.

## Required database setup

If the development project's public schema is empty, apply `supabase/migrations/202609150001_localkart.sql`, then `202609150002_er_alignment.sql`, then `202609150003_feature_completion.sql`, once each within a transaction using Supabase SQL Editor. If already installed, apply only pending migrations and inspect the API schema cache instead of rerunning the initial migration. Do not delete existing tables/accounts or reset a production database.

If users signed up before the profile table/trigger existed, they may have an Auth account but no public profile. They need an explicitly reviewed profile backfill after schema installation. Never infer ADMIN privileges from signup metadata. The custom migration runner intentionally stops if an empty-schema project has existing Auth accounts or a nonempty schema is untracked.

For automated deployment, supply the project's downloaded CA certificate via `SUPABASE_DB_CA_FILE`. The PostgreSQL connection previously failed certificate validation; TLS verification must remain enabled.

## Authentication errors

- Login 401: credentials were rejected. Register first using a real email, or use password reset. A failed registration does not guarantee an account was created.
- Unconfirmed email: confirm the email before login. The API now identifies this separately as 403.
- Registration 400: read the inline form error and Network response JSON. Invalid input, email restrictions, password policies and provider failures must not be silently treated as success.
- Restricted email delivery: configure custom SMTP for public signup. Development-only changes to confirmation policy must be made deliberately in the Supabase dashboard, not bypassed in the app.
- Rate limiting: wait before retrying; the API now preserves 429.

Provider mappings follow [Supabase Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes). No user passwords or authentication policies were changed by this fix.

## Code changes and checks

The API now reports missing migrations/schema objects explicitly, maps Auth provider errors to actionable messages/statuses, and checks profile-table availability before creating new Auth-only accounts. Added regression tests and a credential-safe, read-only diagnostic command:

```sh
npm run db:check
```

Restart the dev server after these changes. Non-2xx responses are still appropriate for failed requests: hiding browser console errors would not fix missing tables or rejected credentials.

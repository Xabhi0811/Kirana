# Workspace-local PostgreSQL

The local installation uses PostgreSQL 17 Windows binaries from EDB, the binary distributor linked by the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/). No system-wide PATH changes or Windows service are required.

## Location and connection

- Installation: `.local-postgres/pgsql`
- Database files: `.local-postgres/data`
- Server log: `.local-postgres/server.log`
- Host: `127.0.0.1` (loopback only)
- Port: `54329` (separate from Supabase/Docker defaults)
- Database: `localkart`
- Database administrator: `postgres`
- Random password: `.local-postgres/credentials.json` — ignored by Git; never share it.

The cluster uses SCRAM password authentication, not `trust`. Files inherit Windows workspace permissions; protect the workspace and credential file against other local accounts. Do not expose this development cluster to the network or use the administrator account as a production application identity.

## Terminal commands

```sh
npm run local:db:setup
npm run local:db:start
npm run local:db:status
npm run local:db:stop
```

`setup` initializes a fresh cluster, creates `localkart`, and applies pending migrations 001–003 with checksum tracking. It refuses an untracked nonempty database. Rerunning setup does not reset data or reapply installed migrations. Start the database again after restarting Windows.

Open the PostgreSQL terminal in PowerShell:

```powershell
& .\.local-postgres\pgsql\bin\psql.exe -h 127.0.0.1 -p 54329 -U postgres -d localkart
```

Enter the generated password when prompted. Inside `psql`:

```sql
\dt public.*
\d public.users
\d public.orders
SELECT version();
SELECT version, applied_at FROM private.localkart_migrations ORDER BY version;
```

## Tables and Supabase boundary

Installation verified: PostgreSQL **17.11**, all **16 public application tables** with RLS enabled, **28 foreign-key relationships**, and all three migrations installed. Native PostgreSQL verified the own-profile policy and profile trigger; ADMIN signup metadata resolves to CUSTOMER. The verification account was rolled back, not retained.

All application migration tables are installed: users, categories, addresses, shops, products, shopping lists/items, orders/items/tracking, reviews, complaints, chat rooms/messages, audit logs and platform settings. Constraints, indexes, RLS and application SQL functions are retained. Payments remain excluded under the original requirement.

`supabase/local-postgres-bootstrap.sql` supplies **development-only dependency schemas** for applying those Supabase-targeted migrations to plain PostgreSQL: Auth user metadata/UID lookup, Storage object metadata, non-login API roles and a publication. It does not install a login API, verify JWTs, manage sessions/password reset, store uploaded images, or run Realtime services. Setting a development JWT-sub session variable is not authentication and must not be exposed to clients.

**The Next.js app's `.env.local` is unchanged and still points to hosted Supabase.** Plain PostgreSQL alone does not make app signup/login work locally. Do not substitute a PostgreSQL connection string for `NEXT_PUBLIC_SUPABASE_URL` or expose the database password in browser variables.

To run the complete app locally with real Supabase Auth/Storage/Realtime, start Docker Desktop and use the existing Supabase CLI workflow (`npm run db:start`), then configure its local URL/public key and apply migrations through Supabase. That creates a separate managed local stack; do not run the development-only bootstrap there. Alternatively, apply the project migrations to hosted Supabase and retain hosted Auth.

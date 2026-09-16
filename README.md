# Kirana

See the [cleanup and rebranding report](docs/CLEANUP-AND-REBRAND-REPORT.md) for verified behavior, retained compatibility identifiers and legacy stored-image exceptions.

Kirana is a hyperlocal marketplace for nearby shops: discover products, compare prices, share shopping lists in private chat, and place and track orders. Customers, shopkeepers and admins have separate dashboards and access rules.

**Zero delivery and handling fees. No payment functionality:** payment tables, gateways, COD tracking, transactions and refunds are intentionally outside the MVP.

## Contents

- [Project status](#project-status)
- [Features](#features)
- [Technology and architecture](#technology-and-architecture)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Authentication and first admin](#authentication-and-first-admin)
- [Database model](#database-model)
- [Pages and API](#pages-and-api)
- [Demo data](#demo-data)
- [All commands](#all-commands)
- [Testing](#testing)
- [Business rules and security](#business-rules-and-security)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Repository structure](#repository-structure)
- [Documentation](#documentation)

## Project status

The app, three incremental database migrations, development tools and tests are implemented in the repository. Last recorded verification:

- **22** PostgreSQL/validation tests passed.
- **10** desktop/mobile browser smoke tests passed.
- Build, strict TypeScript checks and lint passed.
- Native workspace PostgreSQL **17.11** has all migrations installed: **16 public application tables**, RLS enabled and **28 foreign-key relationships** verified.
- Native profile-trigger/own-profile RLS verification passed; the temporary account was rolled back.
- Hosted Supabase accepted the public key, but REST could not find `public.users` or `public.categories` (`PGRST205`).
- Hosted PostgreSQL inspection failed with `SELF_SIGNED_CERT_IN_CHAIN`; tooling did not apply hosted migrations.
- The full local Supabase stack was not started because Docker's engine was unavailable.
- Live two-user Auth/order/chat integration remains **unverified**. API-fixture browser tests are not a live backend test.

These are recorded results, not continuous health checks. Re-run diagnostics after configuration changes.

**Native PostgreSQL does not automatically connect the app or provide Supabase Auth, Storage or Realtime.** The app uses the Supabase HTTP URL/public key chosen in `.env.local`.

## Features

### Customer

- Register, sign in/out, confirm email, reset password, edit profile/avatar and change email.
- Save multiple addresses, edit/delete them and select a default.
- Choose location with explicit browser geolocation, manual coordinates or a saved address.
- Search nearby shops/products; filter by category, stock and open status; sort by price/distance/rating.
- Compare shop-specific product variants, view catalogs/details, shop contacts, logos, hours and map links.
- Maintain a single-shop cart with explicit replacement confirmation.
- Save/edit multi-shop lists, resolve them against a selected catalog and convert items into a cart.
- Send private text/image/product/list/order messages with live updates and read receipts.
- Place orders, track fulfillment, view history and cancel when permitted.
- Review delivered orders once, view own reviews, raise shop/order/platform complaints and track status.

### Shopkeeper

- Create/manage multiple shops, location, public address, contacts, radius, hours, logo and availability.
- Add/edit/deactivate products, images, prices and inventory.
- Receive orders, accept/reject them and perform valid fulfillment transitions.
- Chat with customers and receive structured lists.
- View shop reviews, manage profile and see operational metrics.
- Prepare listings while awaiting admin approval.

### Admin

- View marketplace metrics; suspend/reactivate users.
- Approve/reject/suspend/reactivate shops.
- Manage categories/hierarchy/images, products, orders, reviews and complaints.
- View 7/30/90-day order-date reports and download CSV.
- Edit public marketplace name, support email and announcement.
- Read administrative audit records through the protected API.

Admin status does not grant blanket access to private customer addresses, shopping lists or chats.

## Technology and architecture

| Area             | Implementation                                                                      |
| ---------------- | ----------------------------------------------------------------------------------- |
| Application      | Next.js 16 App Router, React 19, strict TypeScript                                  |
| UI               | Tailwind CSS 4, shadcn-style components, Radix primitives, Lucide icons             |
| Forms/state      | React Hook Form, Zod, Zustand with account-scoped persisted cart/location           |
| API              | Next.js route handlers, Supabase server/browser clients and SSR cookies             |
| Database         | Supabase PostgreSQL, RLS, constraints, triggers and transactional RPCs              |
| Authentication   | Supabase Auth, verified cookie sessions and server role checks                      |
| Live data/images | Supabase Realtime with polling fallback; Supabase Storage                           |
| Location         | Browser geolocation/manual coordinates, database delivery-radius checks             |
| Tooling/tests    | npm, ESLint, Prettier, tsx, Node tests, PGlite PostgreSQL, Playwright, Supabase CLI |
| Hosting          | Next.js on Vercel; persistent backend services on Supabase                          |

Exact resolved versions are in `package-lock.json`; `package.json` specifies ranges.

Pages call `/api/*`. Handlers validate requests and verify users/roles. RLS controls record visibility; database RPCs handle atomic orders, transitions and authorized structured chat. `src/proxy.ts` refreshes sessions.

Runtime uses Supabase **HTTP clients**, not a direct PostgreSQL connection. The `pg` package is used by development database tools, never browser code.

## Quick start

Requires **Node.js 22+** and npm. Functional login/catalog operations also require configured hosted Supabase or the complete local Supabase stack.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Ctrl+C stops the dev server. Restart after changing environment variables.

Create `.env.local` from [.env.example](.env.example) only if it does not already exist; preserve existing credentials. Configure the variables below.

On Windows PowerShell, use `npm.cmd`/`npx.cmd` if execution policy blocks `npm.ps1`:

```powershell
cd E:\kirana
npm.cmd ci
npm.cmd run dev
```

Production-mode local run:

```sh
npm run build
npm run start
```

The archived standalone HTML/JavaScript prototype is not the application entry point. Rendering the UI alone does not confirm backend readiness.

## Environment variables

Keep real values in ignored `.env.local` or secure deployment configuration. No actual secrets are included here.

| Variable                               | Purpose                                                  | Visibility / requirement                                  |
| -------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase HTTP project URL                                | Public; required by app                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable or legacy anon key                           | Public; required by app                                   |
| `NEXT_PUBLIC_SITE_URL`                 | App origin for Auth redirects                            | Public; localhost in dev, HTTPS in production             |
| `DIRECT_URL`                           | Session-mode PostgreSQL connection for migration tooling | Server-only; optional for runtime                         |
| `SUPABASE_DB_CA_FILE`                  | Downloaded server CA certificate path                    | Tooling-only; needed when default certificate trust fails |
| `SUPABASE_SERVICE_ROLE_KEY`            | Privileged seed/integration access                       | Development tooling only                                  |
| `SEED_PASSWORD`                        | Shared demo password, 10+ characters                     | Development tooling only                                  |
| `RUN_REMOTE_TESTS`                     | Remote integration-test opt-in                           | Set `true` only for selected development project          |
| `PLAYWRIGHT_EXECUTABLE_PATH`           | Optional browser executable override                     | Testing only                                              |

Never put service-role keys/database passwords in `NEXT_PUBLIC_*` variables or commit them. Service-role access bypasses RLS. Rotate exposed privileged credentials before further use.

`DATABASE_URL` is not currently consumed by the app. A PostgreSQL URL/password cannot replace Supabase's public HTTP configuration. URL-encode special password characters in PostgreSQL connection strings.

## Database setup

These environments are separate; installing one does not populate/configure the others.

| Option                      | Provides                                      | Requirements / limits                          |
| --------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Hosted Supabase             | PostgreSQL, Auth, Storage, Realtime and APIs  | Keys, migrations, email/redirect configuration |
| Complete local Supabase     | All backend services                          | Docker-compatible runtime and Supabase CLI     |
| Native workspace PostgreSQL | ER tables, SQL functions, constraints and RLS | Windows binaries; no Supabase HTTP services    |

### Hosted Supabase

1. Configure public project URL/key and site origin.
2. Inspect existing development tables and Auth accounts.
3. On an empty schema, apply migrations **001 → 002 → 003**, once each in a transaction using Supabase SQL Editor.
4. On existing installations, apply only pending migrations. Do not rerun initial SQL/reset a live database.
5. Configure Auth/email/redirects, register users, bootstrap an admin and approve shops.

Existing Auth-only accounts may need a reviewed profile backfill. Do not derive ADMIN privileges from signup metadata.

Optional terminal tooling:

```sh
npm run db:check
npm run db:inspect
npm run db:migrate
```

`db:check` performs read-only HTTP Auth/table checks. `db:inspect` reports PostgreSQL tables/RLS flags and Auth-account count without dumping records or secrets.

Use the session pooler (normally **5432**) in `DIRECT_URL`. The migration runner rejects transaction-pooler port **6543**. For certificate failures, download the project's trusted CA from Database Settings / SSL Configuration and set `SUPABASE_DB_CA_FILE`. TLS verification stays enabled. See [Supabase PSQL guidance](https://supabase.com/docs/guides/database/psql).

The custom runner applies pending files atomically and records checksums in `private.localkart_migrations`. It refuses an untracked nonempty schema or empty-schema bootstrap with existing Auth accounts needing a backfill plan. SQL Editor/CLI installations are not automatically adopted: keep their original deployment method.

### Complete local Supabase

Start Docker Desktop or another compatible container runtime. The CLI/config is already included; do not reinitialize the project.

```sh
npm run db:start
npx supabase status
```

Copy the returned local URL/public key into `.env.local`. Check installed migrations through Studio/CLI and apply pending ones. For a **disposable local database only**, rebuilding the schema is available through:

```sh
npm run db:reset
```

**Reset destroys existing local development data.** Do not use it on valuable data. Stop the stack with `npx supabase stop`.

| Service                  | Address                  |
| ------------------------ | ------------------------ |
| API                      | `http://127.0.0.1:54321` |
| PostgreSQL               | `127.0.0.1:54322`        |
| Studio                   | `http://localhost:54323` |
| Development email viewer | `http://localhost:54324` |

Local email confirmation is disabled in `supabase/config.toml`. Keep the stack private; see [Supabase local development](https://supabase.com/docs/guides/local-development).

### Native workspace PostgreSQL

The portable Windows PostgreSQL **17.11** installation uses:

- Binaries: `.local-postgres/pgsql`.
- Data: `.local-postgres/data`.
- Connection: `127.0.0.1:54329`; database `localkart`; user `postgres`.
- Generated password: ignored `.local-postgres/credentials.json`.
- Logs: `.local-postgres/server.log`.

```sh
npm run local:db:setup
npm run local:db:start
npm run local:db:status
npm run local:db:stop
```

Start again after reboot. Setup initializes the isolated cluster/database, applies pending migrations with checksum checks, refuses untracked nonempty databases and verifies the schema. It does not reset existing data.

Open psql in PowerShell and enter the generated password when prompted:

```powershell
& .\.local-postgres\pgsql\bin\psql.exe -h 127.0.0.1 -p 54329 -U postgres -d localkart
```

```sql
\dt public.*
\d public.users
\d public.orders
SELECT version();
SELECT version, applied_at FROM private.localkart_migrations ORDER BY version;
```

Binaries/data are ignored by Git and absent from a fresh clone. Extract official Windows server binaries into this layout before running native scripts on another machine; see [local PostgreSQL documentation](docs/LOCAL-POSTGRESQL.md).

The development-only bootstrap supplies Auth/Storage dependency schemas and non-login roles for migration compatibility. It is **not a login API, JWT verifier, object storage or Realtime server**. Never run it on managed Supabase or treat its UID session variable as authentication.

Native PostgreSQL binds to loopback and uses SCRAM password authentication. Protect credentials/data files. Installing it does not change `.env.local` or enable local app signup/login.

## Authentication and first admin

Supabase Auth owns credentials/sessions. Public `users` contains profile information, not passwords/hashes.

Registration accepts CUSTOMER or SHOPKEEPER. Password validation requires 10+ characters, uppercase/lowercase and a number. Profile phone uniqueness ignores an optional leading `+`; it does not verify phone ownership.

Development Auth configuration:

- Site URL: `http://localhost:3000`.
- Allowed confirmation URL: `http://localhost:3000/auth/confirm`.
- Allowed recovery/callback URL: `http://localhost:3000/auth/callback`.

Use your deployed HTTPS origin in production. Confirmation follows the Supabase project's policy. Public email delivery may require custom SMTP; see [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

After registering a trusted account and checking its profile, bootstrap the first admin in the trusted database editor:

```sql
UPDATE public.users
SET role = 'ADMIN'
WHERE email = 'your-admin-email@example.com';
```

Replace the example with the intended verified account. This is not a public signup option. ADMIN signup metadata resolves to CUSTOMER. Auth accounts without profiles need explicit backfilling first.

## Database model

| Migration                                                                          | Purpose                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [001: core marketplace](supabase/migrations/202609150001_localkart.sql)            | Tables, constraints, indexes, RLS, profile triggers, order/chat RPCs, Storage and Realtime  |
| [002: ER alignment](supabase/migrations/202609150002_er_alignment.sql)             | Unique/validated phone, snapshot line-total integrity, 12 FK lookup indexes                 |
| [003: feature completion](supabase/migrations/202609150003_feature_completion.sql) | Public settings/admin RLS/audits, bounded reports, order-date index, category-image Storage |

The 16 public application tables:

`users`, `categories`, `addresses`, `shops`, `products`, `shopping_lists`, `shopping_list_items`, `orders`, `order_items`, `order_tracking`, `reviews`, `complaints`, `chat_rooms`, `chat_messages`, `audit_logs`, `platform_settings`.

Private counters/migration tracking/helpers live in `private`; Supabase owns separate Auth/Storage schemas.

A user owns many addresses/shops/lists/orders. Categories form a hierarchy. Each product belongs to one shop. Each order has one customer/shop, snapshot items and tracking events. Delivered orders may have one verified review. Complaints optionally reference orders/shops. Each customer/shop pair has one room with many messages. Public settings are a singleton with audited admin changes.

Shops keep public addresses/coordinates separate from private customer addresses. Order prices/delivery addresses are snapshotted for history. No payment entities are added. See [database ER/permissions](docs/DATABASE.md) and [diagram audit](docs/ER-FEATURE-CHECKLIST.md).

Migration 002 stops on malformed/duplicate phones or inconsistent line totals. Repair affected data deliberately. Do not modify installed migration files; add a new incremental version.

## Pages and API

| Area             | Routes                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public           | `/`, `/search`, `/compare`, `/shops`, `/shops/:id`, `/products/:id`, `/cart`                                                                                                  |
| Auth             | `/register`, `/login`, `/forgot-password`, `/reset-password`                                                                                                                  |
| Customer/account | `/profile`, `/addresses`, `/shopping-lists`, `/checkout`, `/orders`, `/orders/:id`, `/chat`, `/reviews`, `/complaints`                                                        |
| Shopkeeper       | `/shopkeeper`, `/shopkeeper/shop`, `/shopkeeper/products`, `/shopkeeper/inventory`, `/shopkeeper/orders`, `/shopkeeper/chat`, `/shopkeeper/reviews`, `/shopkeeper/settings`   |
| Admin            | `/admin`, `/admin/users`, `/admin/shops`, `/admin/products`, `/admin/categories`, `/admin/orders`, `/admin/reviews`, `/admin/complaints`, `/admin/reports`, `/admin/settings` |

Shared profile/order routes still enforce roles and record ownership.

API groups: Auth, profile, category/discovery, shop/product details, addresses, lists/items, private chat/messages/read receipts, orders, reviews, complaints, management/audits, stats, reports, platform settings and uploads. [API documentation](docs/API.md) covers methods/payloads.

Requests are generally JSON; uploads are multipart. Failed operations retain appropriate HTTP statuses with a friendly `error`. Most record lists use 24-row pages; categories up to 100; messages 50, newest first.

Storage buckets: public `avatars`, `shop-images`, `product-images`, `category-images`; private `chat-images`. JPEG/PNG/WebP images are limited to 4 MiB with validated signatures. SVG is rejected.

## Demo data

Seeding requires full development Supabase services, installed migrations, a development service-role key and `SEED_PASSWORD` (10+ characters).

```sh
npm run seed
# Only for an explicitly selected remote DEVELOPMENT project:
npm run seed -- --allow-remote
```

Seeds 5 shopkeepers, 10 shops, 8 categories, 60 products, 2 customers, an admin, 4 orders and related reviews/lists/chat. Demo listings vary in price/stock and include closed/pending/out-of-radius shops. Profile phones are distinct.

Demo accounts: `shopkeeper1@localkart.test` through `shopkeeper5@localkart.test`, `aarav@localkart.test`, `isha@localkart.test`, `admin@localkart.test`. Use your seed password; none is hardcoded. The Auth-admin seed tool confirms development accounts.

Choose coordinates **12.9784, 77.6408** (Indiranagar, Bengaluru) or a seeded Home address. Actual browser location may have no demo shops.

**Re-seeding resets demo stock/prices. Never seed production.** Native PostgreSQL metadata alone cannot run the Supabase HTTP/Auth seed script.

## All commands

| Command                     | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `npm run dev`               | Development server, default port 3000                        |
| `npm run build`             | Production build with TypeScript validation                  |
| `npm run start`             | Serve existing production build                              |
| `npm run typecheck`         | Strict TypeScript check                                      |
| `npm run lint`              | ESLint                                                       |
| `npm run format`            | Format source/scripts/tests/config; modifies files           |
| `npm test` / `npm run test` | PostgreSQL/validation/error regression tests                 |
| `npm run test:browser`      | Desktop/mobile smoke tests                                   |
| `npm run test:integration`  | Live development Supabase flow; skips without prerequisites  |
| `npm run seed`              | Development Supabase demo data                               |
| `npm run db:check`          | Read-only HTTP Auth/table diagnostic                         |
| `npm run db:inspect`        | Read-only configured PostgreSQL schema/Auth-count diagnostic |
| `npm run db:migrate`        | Apply pending tracked migrations via session connection      |
| `npm run db:start`          | Start local Supabase containers                              |
| `npm run db:reset`          | Destructively rebuild disposable local Supabase data         |
| `npm run local:db:setup`    | Initialize native cluster/apply pending migrations/verify    |
| `npm run local:db:start`    | Start native PostgreSQL                                      |
| `npm run local:db:status`   | Check native PostgreSQL                                      |
| `npm run local:db:stop`     | Stop native PostgreSQL cleanly                               |

`db:start` and `local:db:start` are different backends.

## Testing

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
npm run test:integration
```

PGlite tests execute actual SQL migrations with fixtures for external Supabase schemas. Coverage includes discovery/variants, category cycles, RLS/escalation, private structured chat, price/stock/address validation, idempotency/snapshots/cancellation, reviews/audits, settings/report permissions and category-image policies.

Browser smoke tests use installed Windows Chrome or `PLAYWRIGHT_EXECUTABLE_PATH`. Otherwise install Chromium:

```sh
npx playwright install chromium
```

Tests run production-mode port **3100**; build first. Output/screenshots/traces are ignored. Category/announcement/map tests use API fixtures.

Live integration requires installed development Supabase, public configuration and a server-only test service key. Remote runs additionally require `RUN_REMOTE_TESTS=true`. Tests create isolated fixtures, exercise registration/list sharing/replies/orders/delivery/reviews and clean up their own records. A skip is not a live pass.

## Business rules and security

- One shop per cart/order; saved lists may span shops.
- Discovery/checkout enforce delivery radius, approved shops and owned delivery addresses.
- `place_order` checks current price/stock/listing/account states, locks products deterministically, computes totals and writes reservation/snapshots/tracking atomically.
- Customer/request idempotency keys prevent duplicate stock reservations.
- Price changes require explicit cart refresh.
- Fulfillment: PLACED → ACCEPTED → PREPARING → OUT_FOR_DELIVERY → DELIVERED.
- Permitted early cancellation/rejection restores stock once.
- One verified review per delivered order.
- Order item/address snapshots preserve history.
- Public tables use RLS; server-side roles, suspension guards and escalation triggers protect operations.
- Private chat/images are restricted to participants/owning keeper; structured payloads come from authorized records.
- APIs use bounded bodies, Zod and same-origin mutation checks. Application-owned rate limiting was removed by migration `202609160001_remove_rate_limits.sql`; Supabase Auth provider limits still apply.
- Admin mutations are audited. Runtime never uses the service-role key.
- Uploads enforce type/signature/ownership; private chat images use signed URLs.
- Security headers cover anti-framing, content type, referrer, geolocation and limited CSP directives.
- Trigram/bounding/pagination/FK indexes support discovery and lookups; representative production benchmarks are still needed.

These safeguards are not a claim of a complete production security/load audit. Never expose the native development UID helper as authentication.

## Deployment

Demo fixtures, verified fixes, remaining limitations and manual walkthroughs are documented in [PROJECT-CHECK-REPORT.md](docs/PROJECT-CHECK-REPORT.md). Run `npm run seed:demo -- --allow-remote --project=<development-project-reference>` to explicitly confirm the development target. Credentials are stored in ignored `.demo-data.json`; never seed production. `npm run test:demo` exercises live workflows, `npm run test:security` checks direct RLS/API/storage/concurrency, and `npx playwright test` runs both desktop/mobile profiles. Build first and run browser suites sequentially.

Vercel supports this Next.js app; see [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

1. Apply reviewed pending migrations to the selected Supabase project.
2. Configure public URL/key and HTTPS site origin.
3. Allow matching Auth redirects and configure working email/SMTP.
4. Bootstrap a trusted admin and approve shops.
5. Keep production and preview/test configuration separate.
6. Run checks and live integration on development data.
7. Exclude seed/test keys, passwords and native database files from deployment.
8. Review backups, monitoring, request/image limits, rate limits and security policies before production.

Persistent database/auth/images run on Supabase, not Vercel's app filesystem. Runtime deployment does not require `DIRECT_URL` or a service-role key. Workspace PostgreSQL is not a production hosting solution.

## Troubleshooting

| Symptom                                              | Resolution                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| PowerShell blocks npm script                         | Use `npm.cmd`/`npx.cmd`                                                 |
| Categories return 503 / `PGRST205`                   | Run `db:check`; inspect migrations and API schema cache                 |
| Login 401                                            | Check registration succeeded, credentials or reset password             |
| Email confirmation 403                               | Confirm using the email link                                            |
| Registration fails                                   | Read inline/API error; check schema, real email, SMTP and Auth logs     |
| Rate limit 429                                       | Wait; do not bypass limits                                              |
| Auth account has no profile                          | Review explicit backfill; never infer ADMIN from metadata               |
| PostgreSQL certificate failure                       | Configure trusted CA; do not disable verification                       |
| Migration refuses nonempty schema                    | Inspect tracked/untracked installation; keep original deployment method |
| ER data constraint fails                             | Deliberately resolve duplicate/invalid phones or bad totals             |
| Docker unavailable                                   | Start container engine; native PostgreSQL is a separate backend         |
| Native binaries missing                              | Extract official Windows server binaries into expected layout           |
| Native DB stopped                                    | Run `local:db:start`; inspect port 54329/logs                           |
| No demo shops nearby                                 | Use Bengaluru coordinates; check approval/radius/status                 |
| Cross-shop cart conflict                             | Explicitly keep/replace cart or save to list                            |
| Order price/stock changed                            | Refresh catalog/cart; follow idempotency behavior                       |
| Browser cannot launch                                | Install Chromium/set executable, build first, check port 3100           |
| Restricted Windows runner reports OS-user-info error | Run approved tests outside that restricted runner                       |

See [detailed Supabase recovery instructions](docs/SUPABASE-TROUBLESHOOTING.md). Hiding console errors does not fix failed authentication or missing tables.

## Repository structure

```text
src/
  app/                 Pages/layouts, Auth callbacks and centralized API route
  components/          Discovery/accounts/shops/orders/lists/chat/admin UI
  hooks/               Query/debounce helpers
  lib/                 Auth/Supabase clients/validation/types/errors/state
  proxy.ts             Session refresh
supabase/
  config.toml          Local Supabase configuration
  migrations/          Incremental tables/RLS/RPC/Storage changes
  local-postgres-bootstrap.sql  Native dependency schemas only
scripts/
  database.ts          Session inspection/checksum migrator
  check-supabase.ts    Read-only HTTP diagnostic
  local-postgres.ts    Native Windows database setup/lifecycle
  seed.ts              Development demo data
tests/
  *.test.ts            SQL/validation/error regression tests
  browser/             Smoke and live integration tests
docs/
  prototype/           Archived static prototype
  *.md                 ER/API/setup/review/troubleshooting
.local-postgres/       Ignored binaries/data/credentials/logs
.env.example           Credential-free template
package-lock.json      Resolved dependency versions
```

## Documentation

- [API methods and payloads](docs/API.md)
- [Database ER and permissions](docs/DATABASE.md)
- [Diagram feature audit](docs/ER-FEATURE-CHECKLIST.md)
- [Earlier ER review and changes](docs/ER-REVIEW-AND-CHANGES.md)
- [Native PostgreSQL setup/terminal usage](docs/LOCAL-POSTGRESQL.md)
- [Supabase troubleshooting](docs/SUPABASE-TROUBLESHOOTING.md)

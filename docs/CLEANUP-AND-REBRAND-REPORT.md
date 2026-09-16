# Kirana Cleanup & Rebranding Report

16 September 2026. Scope: conservative source cleanup and branding only. The request named LocalMart; repository inspection found **LocalKart** as the actual brand. Both legacy spellings are handled by the display compatibility helper.

## 1. Project cleanup

### Removed

| File                              | Reason / reference checks                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/realtime-diagnostics.ts` | Temporary investigation script from the previous audit. No imports, dynamic imports, package command, config, documentation, route or deployment reference was found. Its diagnostic purpose is superseded by the retained two-browser realtime regression tests and the retained publication/RLS audit script. No regression test was removed. |

Recovery copy: `C:\Users\chabh\AppData\Local\Temp\kirana-cleanup-d05e7e63ed724ed9bb6595568e01a37e\realtime-diagnostics.ts`. This is outside the project and is available until temporary files are cleared.

### Retained deliberately

- All seven migrations, Supabase configuration/bootstrap/certificate/integrity SQL, both seeders and database/local-Postgres utilities: operational dependencies, including paths referenced dynamically by scripts.
- All existing tests: different unit, database, smoke, integration, live workflow and direct security coverage.
- `docs/prototype/*`: explicitly documented historical prototype/design reference. Not an application entry point, but not an accidental orphan; its visible text was rebranded.
- Earlier audit/ER/setup documents and `docs/audit-evidence.json`: referenced operational/history evidence. Evidence exports were not rewritten to pretend the stored database default had changed.
- `src/components/ui/skeleton.tsx`: imported by shared loading feedback; not unused.
- `AGENTS.md`, `CLAUDE.md`, `next-env.d.ts`, TypeScript/Next/Tailwind/ESLint/shadcn/Playwright configuration: framework/tooling entry points, not ordinary import leaves.
- `.env.local`, `.demo-data.json`, `.local-postgres/`, certificate and generated framework/test artifacts: configuration, credentials, local database, trust material or expected generated output. No database/cache directory was recursively deleted.

### Dependency analysis

Next filesystem routes → catch-all page → feature components → query/store/Auth helpers → catch-all API → Supabase/RPC/RLS. Shared UI components are referenced by feature forms/feedback. Styles are imported by the root layout and Tailwind PostCSS configuration. Script entry points are in `package.json`; migration discovery uses filesystem paths. Playwright discovers browser tests by directory, not application imports. Database tests load actual SQL migration files. Docs link to operational scripts, schema and historical reports.

Both literal and dynamic-path references were checked before deletion. There is no repository `public/` asset directory, Dockerfile or CI pipeline file to prune. Installed dependency contents were treated as vendor code, not cleanup candidates. No uncertain application file was removed.

## 2. Dependencies

Removed dependencies: **none**. Every declared package has a source, framework, CLI, type-checking or configuration purpose.

| Group                                                | Verified purpose                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Next, React, React DOM                               | App Router/runtime/rendering; React DOM is required even without a direct source import |
| Supabase SSR/JS                                      | Auth cookies, API/database clients, Storage, realtime and fixtures                      |
| Zod, React Hook Form, resolvers                      | Input validation and form submission                                                    |
| Radix Dialog/Slot, Lucide, CVA, clsx, tailwind-merge | Existing UI primitives/icons/style composition                                          |
| Zustand                                              | Account-scoped persisted cart/location                                                  |
| Sharp                                                | Existing upload validation and fixture rendering                                        |
| pg, PGlite                                           | Database tools and real-SQL regression tests                                            |
| Playwright                                           | Browser/API/realtime checks                                                             |
| TypeScript and type packages                         | Source/Node/pg/React type checking                                                      |
| ESLint/Next ESLint, Prettier                         | Existing lint/format commands                                                           |
| Tailwind/PostCSS                                     | CSS compilation                                                                         |
| tsx, Supabase CLI                                    | Script/test runners and local Supabase commands                                         |

`npm install --offline --ignore-scripts` validated the package/lockfile using the local cache. No dependency upgrade/removal was requested or performed. Root package and lockfile names agree on `kirana`. This offline install is not a fresh online vulnerability audit.

`npm ls --depth=0` exits successfully but labels six installed WASM/Sharp fallback packages extraneous (`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`). These are not declared application dependencies. They were retained rather than manually pruning uncertain vendor/platform fallback contents from the working installation.

## 3. Branding

Changed actual application branding **LocalKart → Kirana**; the requested LocalMart variants were absent from the original source.

- Browser title/default metadata/template, desktop/mobile wordmark and footer.
- Discovery empty-state text, Supabase configuration messages and database setup guidance.
- CSV download filename prefix (`kirana-orders-…`). This changes only the suggested filename, not report contents/API data.
- README, document headings/prose, archived prototype title/wordmark/initial.
- Package name and root lockfile metadata.
- Test display fixtures and future generated demo artwork label (`KIRANA · DEMO`).

`displayMarketplaceName()` maps only exact legacy default names to Kirana for display and the settings form. Custom administrator-selected names are preserved. Existing database values and API response formats are unchanged; saving a form remains the user's normal action. Tests cover legacy aliases and unchanged custom names.

No layouts, CSS rules, colors, spacing, navigation paths or business workflows were redesigned. The wordmark keeps its existing two-color span structure.

## 4. Compatibility

| Retained reference                                                                            | Why it remains                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202609150001_localkart.sql` and contents of applied migrations                               | Filename/checksum/history compatibility. All seven SHA-256 hashes match the pre-cleanup values.                                                                             |
| `private.localkart_migrations`, migration advisory-lock names and connection application name | Existing migration tracking/coordination and operational identification                                                                                                     |
| Local database `localkart`, Supabase `project_id = "localkart"`                               | Renaming could switch the database/container installation or break scripts                                                                                                  |
| Zustand/localStorage key `localkart`                                                          | Preserves existing carts/location instead of silently starting fresh                                                                                                        |
| `localkart-full-demo:` / `localkart-dev:` hashes and seed lock                                | Stable entity IDs and repeatable seeding                                                                                                                                    |
| `…@localkart.test` demo addresses                                                             | Existing real demo Auth identities, working credentials, ownership and linked data                                                                                          |
| Legacy platform default and Auth fallback name in SQL                                         | Applied migrations and existing data remain untouched; marketplace default is mapped only in presentation                                                                   |
| Old names in compatibility tests and this report                                              | Intentional regression inputs/explanation, not accidental visible branding                                                                                                  |
| Existing uploaded images/screenshots/historical content                                       | Stored user/demo assets were not overwritten or chat history rewritten. Previously rasterized `LOCALKART` labels can remain in old demo images; future artwork uses Kirana. |

No API endpoint, table/function/bucket name, policy, relationship, request/response format or environment variable was renamed. Environment values/secrets were neither changed nor printed. There were no legacy-branded environment variable names to migrate.

Final search included LocalMart/LOCALMART/localmart/Localmart/local-mart/local_mart and the actual LocalKart variants across first-party source, scripts, tests, docs and configuration. Remaining occurrences are the compatibility/history categories above. Vendor/cache directories and credential values are not branding replacement targets.

## 5. Tests

| Test                                                           | Result                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| Production build                                               | PASS                                                           |
| TypeScript                                                     | PASS                                                           |
| Lint                                                           | PASS                                                           |
| Unit/DB tests                                                  | PASS — 33 cases, including 2 new brand compatibility tests     |
| `npm run test:browser`                                         | PASS — 10 desktop/mobile smoke cases                           |
| Full desktop/mobile browser/API suite                          | PASS — 48 passed, 2 email-integration cases skipped            |
| Demo workflows                                                 | PASS — all 18 desktop/mobile cases in the full suite           |
| `npm run test:demo -- --output=test-results/demo-verification` | PASS — 9 desktop cases rerun explicitly                        |
| Direct RLS/security/storage/concurrency                        | PASS — 16 desktop/mobile cases in the full suite               |
| Original email-registration integration                        | BLOCKED/SKIPPED — existing service-role/email setup limitation |

The full suite includes the existing demo/security/integration specifications plus four new desktop/mobile branding checks. Existing regressions were retained, not replaced by page-load-only tests. Live suites use development demo accounts and create their normal labeled audit records; temporary test CRUD fixtures are cleaned by the existing tests. No production migration or full reseed was run for this cleanup.

## 6. Functional verification

The complete run finished with 48 passing browser/API cases, including four new branding checks. Together with 33 unit/database cases, 81 distinct configured cases passed; two email integration cases were skipped. Separate repeated smoke/demo runs are not added to that total. Authentication email delivery remains outside the available setup; a demo login is not proof of signup mail delivery.

| Feature              | Result / evidence                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Authentication       | PASS — active roles, suspended response, session refresh/logout; email onboarding BLOCKED                   |
| Customer             | PASS — real catalogue/list/cart/checkout/support workflow                                                   |
| Shopkeeper           | PASS — own shop/product CRUD, fulfillment and chat                                                          |
| Admin                | PASS — categories, moderation, users, settings and audit trail                                              |
| Shops / Products     | PASS — creation/edit/state/stock/price and ownership                                                        |
| Cart / Orders        | PASS — quantity/removal/persistence, checkout, tracking, cancellation, last-unit concurrency                |
| Reviews / Complaints | PASS — delivered-order review and support resolution                                                        |
| Chat / Realtime      | PASS — all five message types, actual recipient change events and reconnect                                 |
| Storage              | PASS — five buckets, images, rejection and signed expiry                                                    |
| Location             | PASS — manual/mocked coordinates and real nearby results                                                    |
| RLS/Security         | PASS — direct cross-account denial and SQL regressions                                                      |
| Visual brand         | PASS — titles/wordmark/public pages/role screens and settings display; desktop/mobile screenshots inspected |

## 7. Final status

Removed one obsolete investigation script with a recovery copy; removed no dependency or meaningful test. Rebranded application/source/documentation text and package metadata. Preserved the working database, all migration checksums, API/security/realtime contracts, existing demo identities, saved-cart key, environment and stored assets.

Remaining limitations: existing rasterized demo image labels are historical content; email signup integration requires its pre-existing missing setup. The previous functional audit's production-load/accessibility/other-browser limitations are unchanged. Cleanup is not a claim of exhaustive production certification.

Use the same local URL and demo credentials as before. See `docs/PROJECT-CHECK-REPORT.md` for the manual customer/keeper/admin walkthrough; the generated password remains in ignored `.demo-data.json`.

The existing `http://localhost:3000/login` was checked after cleanup: HTTP 200 with a Kirana browser title. Visual evidence is in `test-results/kirana-desktop.png` and `test-results/kirana-mobile.png`.

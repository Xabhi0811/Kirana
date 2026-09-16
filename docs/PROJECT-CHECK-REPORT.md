# Kirana Complete Functional Audit

Checked 16 September 2026 against the configured **development** Supabase project and local Next.js production build using real demo accounts. Local application: `http://localhost:3000`; test production server: port 3100.

This report distinguishes executed checks from inspection and unavailable tests. It is not a guarantee that every input, device, load condition or deployment environment has been tested. The three original failures were reproduced and fixed without disabling RLS.

Supporting evidence: [entity/relationship matrix](ER-AUDIT-MATRIX.md), [API verification matrix](API-AUDIT-MATRIX.md), [hosted schema and integrity export](audit-evidence.json), [read-only integrity SQL](../supabase/tests/integrity.sql).

## 1. Build

| Check                                         | Result                                            |
| --------------------------------------------- | ------------------------------------------------- |
| `npm run build`                               | PASS, production compilation and route generation |
| `npm run typecheck`                           | PASS                                              |
| `npm run lint`                                | PASS                                              |
| Existing local `/api/categories` on port 3000 | PASS, HTTP 200                                    |

Kept Next.js, React, TypeScript, Supabase Auth/Postgres/Storage/Realtime, Zod and Zustand. Sharp is now an explicit dependency for decoding uploads and rendering fixture illustrations; it was already available transitively. No framework replacement or second authentication system was introduced.

## 2. ER Diagram Compliance

PASS for the implemented zero-payment MVP's 16 public tables and documented relationships. The entity matrix covers Auth, profiles, categories, addresses, shops, products, lists/items, browser cart, orders/items/tracking, reviews, complaints, rooms/messages, audit logs, settings and storage. The evidence JSON records exact columns, types, nullability, defaults, keys, delete rules and policies.

Documented differences retained:

- Auth owns passwords; public profiles do not duplicate password hashes.
- Public shop contact/location data is separate from private customer addresses.
- Cart is account-scoped browser state, not a database/cross-device cart.
- `PLACED` means pending order. Shop operating state and approval state are separate.
- Rooms support customer–shopkeeper chat, not customer–customer chat.
- Payments remain excluded by the recorded zero-payment MVP requirement despite a payment branch in the earlier diagram.
- Image URLs are not foreign keys to Storage; unreferenced-file cleanup is not implemented.

The original supplied image is not stored in this checkout. Comparison used the Mermaid diagram and the recorded earlier interpretation; independent re-reading of that external image is NOT VERIFIED. No design was changed just to pass a test.

## 3. Database

PASS: all 16 public tables have RLS; 83 constraints and 56 indexes were inspected. Uniqueness covers profile email/normalized phone, default address, customer/shop room, review/order and customer/request key. Foreign keys are validated; historical address/item-price snapshots remain intact.

Read-only checks cover totals, nonempty orders, line totals, negative stock, review/order ownership/delivery, complaint/order relationships, message participants, missing Auth profiles, unvalidated foreign keys, duplicate defaults and latest tracking status. Auth/profile IDs and emails were also compared. Final results and totals are in `audit-evidence.json`.

Final result: **all 11 integrity checks returned zero violations**; missing/orphan Auth profiles and mismatched emails were also zero. The rolled-back live shop INSERT RETURNING reproduction now passes.

Three additive audit migrations were applied; old installed files were not edited:

1. `202609160002_audit_security.sql`: shop SELECT policy, caller-only account status and dangerous-grant revocation.
2. `202609160003_product_name_sort.sql`: correct product name ordering before pagination.
3. `202609160004_tracking_event_time.sql`: event timestamps instead of transaction-start timestamps.

The earlier rate-limit-removal migration remains unchanged. No non-demo users/business records were deleted. Only tied histories belonging to deterministic baseline demo orders were repaired.

## 4. Authentication

| Workflow                                                    | Result                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Five active demo identities/roles                           | PASS                                                                    |
| Customer/keeper/admin cookie sessions and navigation        | PASS                                                                    |
| Wrong credentials                                           | PASS, 401                                                               |
| Logout then private request                                 | PASS, 401                                                               |
| Suspended login                                             | PASS, useful 403 and newly created session cleared                      |
| Hidden suspended profile / caller-only status               | PASS, RLS retained                                                      |
| Profile read/update                                         | PASS                                                                    |
| Direct refresh-token workflow                               | PASS, identity retained                                                 |
| Invalid/forged token                                        | PASS, rejected                                                          |
| Registration validation/admin-role exclusion                | PASS                                                                    |
| Real signup/confirmation/resend/reset/email-change delivery | BLOCKED: service-role integration/mailbox/SMTP verification unavailable |
| Natural expiry across a full token lifetime                 | NOT VERIFIED; refresh/invalid-token tests are not equivalent            |

Confirmed demo fixtures do not prove public email onboarding works. No arbitrary existing account was auto-confirmed for this audit.

## 5. Customer Workflow

PASS: login, profile update, address create/read/delete, manual location, mocked geolocation, real nearby catalogue, categories, shop/product detail, brand/package comparison, list CRUD/items/resolution with unmatched items, cart quantity/removal/persistence, checkout, order placement/tracking/cancellation, delivered review, support complaint, chat/images and logout.

Address update/default switching is covered by SQL/RPC tests, not a browser edit of every field. Live demo mutations use the actual backend. Mock-based smoke tests are identified separately below.

## 6. Shopkeeper Workflow

PASS: login, dashboard/statistics, shop/product pages, shop creation, new shop visible in management UI, shop edit/close, product create/price/stock edit/deactivation, own orders, acceptance/preparation/dispatch/delivery, chat and image uploads.

Original 403 root cause: `shops_read` called a STABLE helper querying shops during `INSERT ... RETURNING`; its earlier statement snapshot could not see the new row. The new policy evaluates owner/role/approval on the row directly, retaining public/admin visibility. Customer insertion, forged ownership and self-approval remain denied.

## 7. Admin Workflow

PASS: dashboard/statistics/reports, management screens, category create/edit/delete, shop rejection/suspension/pending/approval, demo-user suspension/restoration, complaint resolution, announcement update/read/restore and audit-log verification. Non-admin management/report requests remain forbidden. Self-suspension through the API is rejected.

Admin removal of an existing review is implemented/inspected but not live-tested: NOT VERIFIED, rather than inferred from its page loading.

## 8. Chat

PASS for TEXT, PRODUCT, PRODUCT_LIST, ORDER and IMAGE: inserted through API/RPC, retrieved by participants and displayed automatically in the recipient browser. Tests use two authenticated contexts and record actual `postgres_changes` frames. Structured messages must appear within five seconds, before the 15-second polling fallback. Recipient reload/reconnect and a seller-to-customer reply also pass.

Stored payloads, room/sender relationships and read-receipt updates are covered by live/SQL tests. Another customer and an admin cannot read the room/messages or obtain private image URLs using direct public-key clients.

Root cause of earlier delayed delivery: browser subscription preceded initialization with the cookie-backed Auth session. An anonymous channel connected while RLS filtered changes. The client now awaits `realtime.setAuth()` and requests database subscription readiness before displaying “Live chat.” Channel/timer cleanup remains intact.

Unread/read-receipt APIs are exercised. Every visual badge/room-switch combination and prolonged offline recovery are NOT VERIFIED. Reconnect coverage is a page reload, not a long network outage.

## 9. Storage

PASS: all five buckets (`avatars`, `shop-images`, `product-images`, `category-images`, private `chat-images`) accept PNG fixtures. Valid JPEG upload/download also passes. Public category artwork and participant-signed private images render.

PASS: invalid signatures, corrupt header-only PNG, oversized files, unauthorized buckets, forged owner paths, outsider/admin private downloads and expired private URLs are rejected. Expiry tests verify a five-second URL while valid, then request it after expiration with a cache-busting parameter. An earlier one-second test expired before its initial download on one run; the test timing was corrected, not security behavior.

Uploads are now decoded with a 25-million-pixel ceiling; magic bytes alone previously accepted corruption. Oversized files return 413. A valid WebP round trip is NOT VERIFIED. Old development uploads remain; automatic orphan-object cleanup is NOT IMPLEMENTED.

## 10. Orders

PASS: all six states, valid transitions, totals, immutable snapshots, repeated request reuse, atomic stock decrement and cancellation restoration once. SQL rejects skipped/unauthorized transitions, undelivered/duplicate reviews, mixed-shop items, forged/stale prices, unavailable products, invalid addresses and overselling.

Two live buyers concurrently attempted to purchase a dedicated last-unit product: exactly one succeeded; stock reached zero; cancellation restored one. This is a two-request check, not a production-load benchmark.

Tracking repair: legacy seeded transitions shared `now()` within one transaction. New events use `clock_timestamp()`; only tied deterministic demo histories were ordered. Order progress/stock and non-demo history were preserved.

## 11. Location

PASS at Indiranagar, Bengaluru, **12.9784 / 77.6408**: eligible nearby shops appear; faraway, pending, rejected, suspended and inactive shops are excluded. Approved closed shops are excluded when `open_only` is requested. Brand/package comparisons remain distinct.

PASS: manual selection, mocked browser geolocation, invalid bounds and rejection of blank/null/boolean coordinates. Those values previously silently coerced to zero. Physical GPS hardware/accuracy is NOT VERIFIED.

## 12. Security

PASS: direct hosted public-key tests for cross-customer privacy, owner-only products, guarded approval/ownership, no self-promotion, private chat/images, account-status scope and admin APIs. SQL tests additionally exercise suspended users, dangerous grants and forged Storage paths.

TRUNCATE, TRIGGER and REFERENCES were revoked from `anon`/`authenticated` on public tables and future default grants. RLS does not protect TRUNCATE. This was an unsafe database grant, not proof of an exploitable REST truncation endpoint.

Same-origin checks remain enabled; unsupported mutation methods return 405; database uniqueness conflicts map to 409. No service-role secret was added to frontend code. Hosted Auth limits remain separate from the earlier user-requested removal of project mutation limits.

NOT VERIFIED: formal penetration testing, exhaustive revocation scenarios, dependency CVE audit and production abuse/load assessment.

## 13. UI

PASS: 26 intended-role routes load expected headings/paths without JavaScript exceptions; final route sweeps also reject unexpected API errors. Customer checkout/cart mutations, live chat, new-shop visibility and mocked geolocation run in desktop/mobile profiles.

PASS: smoke navigation, overflow, manual-location validation, empty cart and registration validation. Two smoke cases stub catalogue/settings or shop data; these are component tests, not evidence of backend success. The separate demo suite uses real data.

NOT VERIFIED: every route under every wrong role, all loading/error variants, accessibility, Safari/Firefox, physical devices and exhaustive visual layouts. Wrong-role API/direct-RLS checks do not equal an exhaustive route/role matrix.

## 14. Demo Data

Baseline: six accounts; eight categories; eight scenario shops; 72 standard products plus a low-stock product; Home/Office addresses for all three demo customers; two populated lists and an empty list. Active customers have all six order states, reviews, three complaint states and private chat with every supported message type.

Thirty-two deterministic illustrated assets cover categories, storefronts, packaging, avatars and private chat. They are labeled placeholders, not photographs. Live tests retain labeled orders/reviews/complaints/messages, closed audit shops and deactivated products for inspection. Temporary CRUD lists/categories/addresses and JPEG upload are removed by their tests. Final totals, including four existing non-demo users, are in `audit-evidence.json`.

| Data        | Rows | Data              | Rows |
| ----------- | ---: | ----------------- | ---: |
| Users       |   10 | Categories        |    8 |
| Shops       |   15 | Products          |   88 |
| Addresses   |    6 | Shopping lists    |    3 |
| List items  |    8 | Orders            |   52 |
| Order items |   64 | Tracking entries  |  134 |
| Reviews     |   13 | Complaints        |   17 |
| Chat rooms  |    2 | Chat messages     |  106 |
| Audit logs  |  383 | Platform settings |    1 |

Seeder: rejects production `NODE_ENV`; requires remote opt-in and the exact project reference. Stable IDs/existence checks reuse fixtures and artwork. Existing stock, order progress and addresses are retained. Demo role/status and designated artwork are managed fixtures. Run one seeder at a time. Repeat seeding was verified with identical table totals; live tests deliberately grow audit data.

## 15. Test Results

Counts are test cases, not individual assertions. Final combined run:

| Area                                                   | Tests | Passed | Failed | Blocked |
| ------------------------------------------------------ | ----: | -----: | -----: | ------: |
| PostgreSQL/RLS, validation and service errors          |    31 |     31 |      0 |       0 |
| Live demo workflows, desktop + mobile                  |    18 |     18 |      0 |       0 |
| Live API/RLS/storage/concurrency, both profiles        |    16 |     16 |      0 |       0 |
| UI smoke, desktop + mobile                             |    10 |     10 |      0 |       0 |
| Original email registration integration, both profiles |     2 |      0 |      0 |       2 |
| Total                                                  |    77 |     75 |      0 |       2 |

Build/typecheck/lint and hosted integrity inspection are additional checks. Playwright labels the blocked registration cases “skipped.”

## 16. Remaining Issues

| Priority        | Feature / route                                  | Status, cause and next action                                                                                                                                                                   |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH for launch | Signup/confirmation/resend/recovery/email change | BLOCKED verification: missing integration credential and verified SMTP/mailbox flow. Configure development email and run the original registration integration. Demo login is not a substitute. |
| MEDIUM          | Production resource abuse                        | Project limiter remains intentionally removed. Decide gateway/application controls before public deployment; hosted Auth limits do not cover business endpoints.                                |
| MEDIUM          | Lifetime/load/outage testing                     | NOT VERIFIED beyond refresh, invalid tokens, two-buyer concurrency and page-reload chat reconnect. Add prolonged expiry/network-drop/load tests.                                                |
| LOW             | Storage lifecycle                                | No automatic unreferenced-object cleanup; design reference/ownership-aware cleanup.                                                                                                             |
| LOW             | Coverage gaps                                    | Valid WebP, live admin review removal, exhaustive pagination/filter combinations, all route/role pairs, accessibility and other browsers remain NOT VERIFIED.                                   |

No remaining reproduced shop-creation, suspended-login or prompt chat-delivery failure in the checked workflows. This does not mean the application is defect-free.

## 17. Fixes Made

Already working: core schema/FKs, catalogue/comparison, lists, order transaction rules, verified reviews, support, most role pages, storage permissions and broad ownership RLS.

Broken and fixed:

1. Shop creation 403 → direct-row owner visibility; live insertion/UI and forgery regressions.
2. Suspended login 404 → caller-only status, helpful 403 and session cleanup.
3. Connected-but-filtered chat → authenticated Realtime initialization/readiness; five-type browser delivery/reconnect.
4. Dangerous table grants → privilege/default-grant revocations and regression.
5. Unsupported mutation methods → explicit checks; negative API tests.
6. Password-reset provider errors ignored → failures no longer report success; delivery itself remains unverified.
7. Corrupt images / oversized status → actual decoding, pixel ceiling, 413; storage tests.
8. Product name sorting ignored → SQL fix/regression.
9. Empty/null/boolean coordinates → required numeric input/regression.
10. Ambiguous tracking times → event-time default, scoped demo repair/regression.
11. Generic duplicate response → 409 mapping.

Added safer self-contained seeding, missing fixture states, deterministic artwork/private images, direct security and concurrent-checkout tests, integrity SQL/export, entity/API matrices and historical-document notices. Existing non-demo data was preserved.

## 18. Demo Credentials

| Role               | Email                             |
| ------------------ | --------------------------------- |
| Customer           | `demo.customer@localkart.test`    |
| Second customer    | `demo.customer2@localkart.test`   |
| Shopkeeper         | `demo.shopkeeper@localkart.test`  |
| Second shopkeeper  | `demo.shopkeeper2@localkart.test` |
| Admin              | `demo.admin@localkart.test`       |
| Suspended customer | `demo.suspended@localkart.test`   |

Generated shared development password: ignored **`.demo-data.json`**, not reproduced here. Never use these accounts/direct Auth fixture provisioning in production.

Manual walkthrough:

1. Open port 3000, log in as customer and select Indiranagar (**12.9784, 77.6408**).
2. Browse Demo Neighbour Store; compare 1 kg salt separately from 500 g; inspect stock states.
3. Resolve Weekly Essentials and observe the unmatched item. Add products, change quantities and checkout using Home/Office.
4. In a separate browser/profile, log in as keeper and accept/prepare/dispatch/deliver the order. Review it as customer.
5. Keep both chat pages open; send text, share product/list/order and upload an image. Observe automatic recipient updates/read receipts.
6. Create a shop as keeper; approve/reject/suspend it as admin. Manage categories, resolve complaints and inspect reports/settings/audit logs.
7. Try the suspended account: expect a helpful 403. Inspect seeded shop/order/complaint states without changing real accounts.

## 19. How to Run

PowerShell here requires `npm.cmd` because execution policy blocks `npm.ps1`. Other shells can use `npm`.

```powershell
npm.cmd install
npm.cmd run db:migrate
npm.cmd run dev                       # http://localhost:3000

# Explicit DEVELOPMENT target; never point this at production.
npm.cmd run seed:demo -- --allow-remote --project=oavrgvxjszxtyzvskqrk

npm.cmd test
npm.cmd run build                     # browser tests use production build
npm.cmd run test:browser
npm.cmd run test:demo
npm.cmd run test:security
npx.cmd playwright test              # complete desktop/mobile matrix
npx.cmd tsx scripts/audit-diagnostics.ts
```

`.env.local` supplies public Supabase URL/key, server-only `DIRECT_URL`, site URL and CA path. No service-role key is needed by the development-only database-backed fixture seeder. The original email integration has separate service-role/remote opt-in requirements.

Run browser suites sequentially; they share `test-results/`. Screenshots: `demo-home.png`, `demo-customer.png`, `demo-keeper.png`, `demo-admin.png`, `demo-live-chat.png`. Failures retain traces/error contexts. The existing port-3000 process was left running; an attempted duplicate start correctly reported that the port was already in use.

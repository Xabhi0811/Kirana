# Kirana ER review and changes

Historical report: the certificate/database blockers below have since been resolved. See [the current live audit](PROJECT-CHECK-REPORT.md) for current migration and verification results.

Latest UI/API completion and migration `003` are covered in the [feature checklist](ER-FEATURE-CHECKLIST.md). The earlier `001`/`002` review below is retained as a record of that change; current new-project deployment needs all three migrations.

## Outcome and scope

Reviewed the supplied Kirana mind-map/ER image against the repository's SQL migrations, TypeScript models, validation, seed data and PostgreSQL tests. The core relationships already exist. Added an incremental migration for missing phone uniqueness, line-total integrity and foreign-key lookup indexes. The original migration is unchanged.

**This is a repository/schema review, not confirmation of the hosted database.** The last hosted inspection failed with `SELF_SIGNED_CERT_IN_CHAIN`. No remote tables or records were changed. Both migrations were exercised locally in PostgreSQL via PGlite, with fixtures for Supabase's external Auth/Storage schemas.

## Diagram-to-schema comparison

| Diagram entity/relationship                    | Repository implementation                                                                                     | Assessment                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| User: customer/shopkeeper/admin                | `public.users`, linked 1:1 to `auth.users`; guarded role/status                                               | Matches with security improvements                            |
| Unique phone                                   | Previously an ordinary non-unique phone index                                                                 | Added format check and unique index                           |
| User password hash                             | Owned by Supabase Auth, not `public.users`                                                                    | Intentional security boundary; no duplicate password store    |
| User 1:N Address                               | `addresses.user_id`, default-address partial unique index                                                     | Matches                                                       |
| User 1:N Shop                                  | `shops.owner_id`                                                                                              | Matches; one keeper can own multiple shops                    |
| Shop address FK                                | Public `shops.address` and coordinates, separate from private saved addresses                                 | Intentional difference explained below                        |
| Shop category, radius, hours, status, approval | Category FK; validated coordinates/radius; time fields; status and approval enums implemented as checked text | Matches; approval states replace `is_approved` boolean        |
| Category hierarchy                             | `categories.parent_id`, self-reference and cycle protection                                                   | Matches; added parent lookup index                            |
| Shop/Category 1:N Product                      | `products.shop_id`, `category_id`; numeric price and nonnegative integer stock                                | Matches                                                       |
| Shopping list / cart                           | Persistent `shopping_lists` + `shopping_list_items`; browser cart                                             | Multi-shop lists, single-shop order/cart                      |
| Customer/Shop/Address → Order                  | `orders` FKs and immutable delivery address JSON snapshot                                                     | Matches; deleted saved addresses do not erase history         |
| Order 1:N Order Item                           | Snapshot name, price, quantity and total                                                                      | Matches; added `total_price = unit_price * quantity` check    |
| Order status history                           | Additional `order_tracking` table                                                                             | Improvement over a status-only order record                   |
| Customer N:M Shop via chat                     | Unique `(customer_id, shop_id)` on `chat_rooms`                                                               | Matches                                                       |
| Chat room 1:N Message                          | Sender FK, text/image/product/list/order types, structured payload, read flag                                 | Matches and extends structured sharing                        |
| Order 1:0..1 Review                            | Unique review `order_id`; customer/shop FKs; rating 1–5; delivered-order guard                                | Matches; review is optional, verified by delivery             |
| Order 1:N Complaint                            | Optional order/shop FKs plus required reporting user                                                          | Matches; also supports shop-level complaints without an order |
| Admin actions                                  | Additional `audit_logs` and guarded moderation                                                                | Improvement for traceability                                  |
| Order → Payment                                | No payment table, fields, API or checkout functionality                                                       | Deliberately excluded by the earlier zero-payment brief       |

Field names such as `user_id` versus `id`, `shop_name` versus `name`, `profile_image` versus `avatar_url`, and `image` versus `image_url` are naming differences, not missing relationships. Image fields exist in the database; this review does not claim every diagram feature has its own UI editor.

### Intentional differences

- **Passwords:** Supabase Auth manages credentials, login sessions and reset flows. Public profiles must never hold password hashes. See [Supabase Auth](https://supabase.com/docs/guides/auth).
- **Shop addresses:** Shops publish their own address/coordinates. Customer saved addresses are private under RLS. Reusing a keeper's private saved address as a public shop location would couple two different visibility/lifecycle rules; no such FK was added. A dedicated shop-location entity could be introduced later if multiple branches need it.
- **Payment:** The image contains a Payment entity, payment methods/statuses and a customer “Make payments” feature. These conflict with the explicit earlier ZERO PAYMENT MVP requirement, which remains in force. Adding payments would require a separate approved scope.
- **Cross-shop selection:** Saved lists may span shops, but an order belongs to exactly one shop. The cart enforces this; mixed-shop checkout is rejected by the order RPC.
- **Status:** `SUSPENDED` represents disabled users; shops distinguish `OPEN/CLOSED/INACTIVE` from `PENDING/APPROVED/REJECTED/SUSPENDED` moderation. A boolean would lose useful state.

## Changes made

1. Added [`202609150002_er_alignment.sql`](../supabase/migrations/202609150002_er_alignment.sql), leaving the original installed-version checksum intact.
   - Optional profile phone must contain 10–15 digits with at most one leading `+`, matching existing registration/profile validation.
   - Unique expression index prevents both `9876543210` and `+9876543210` being assigned to different profiles. Missing phones remain allowed for Auth/administrative accounts. This does not infer country codes or verify phone ownership.
   - Preflight checks reject existing malformed/duplicate numbers; no records are deleted or silently rewritten.
   - Added snapshot line-total consistency check. Existing inconsistent order lines will also block migration, rather than being automatically altered.
   - Added 12 indexes: category parent; shop category; list-item product; order address; order-item product; tracking actor; review customer; complaints by user/date, order and shop; message sender; audit actor.
2. Updated [`scripts/database.ts`](../scripts/database.ts) to discover and apply pending SQL migrations in filename order, retain checksum validation and commit the batch atomically. It still refuses to adopt an untracked nonempty schema and still verifies TLS certificates.
3. Updated [`scripts/seed.ts`](../scripts/seed.ts) to give each demo profile a distinct deterministic phone number, including reseeded profiles. Shop contact numbers need not be unique.
4. Updated browser integration fixture phones to avoid the new per-profile uniqueness conflict.
5. Added local PostgreSQL tests for phone format/uniqueness, new constraint/index installation and inconsistent snapshot line totals. Existing security/order/chat tests remain passing.
6. Updated database documentation and README migration instructions; added this report.

## Stack and optimization assessment

Kept Next.js App Router, TypeScript, Supabase Postgres/Auth/Realtime/Storage, Tailwind, Zod, React Hook Form and Zustand. The diagram does not justify a framework rewrite, second ORM, separate credential store or extra backend service.

Existing safeguards retained: RLS, immutable order/address snapshots, stock row locks, idempotency keys, transactional cancellation/restoration, category-cycle checks, trigram name search, bounded geographic search and paginated discovery.

New indexes address previously unindexed foreign-key lookups and complaint ownership/history access. PostgreSQL does not automatically create indexes on referencing FK columns; see [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html). Phone uniqueness uses a [partial index](https://www.postgresql.org/docs/current/indexes-partial.html), excluding missing numbers. These indexes cost storage and write work: **no production speedup is claimed without representative data and query plans.** Existing indexes were not removed without usage evidence. Benchmark discovery/RLS queries with `EXPLAIN (ANALYZE, BUFFERS)` on a development dataset before further tuning or a PostGIS migration.

## Verification and deployment

- `npm run test`: **16 passed**, including actual SQL migration execution in local PostgreSQL.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Hosted database inspection/migration: not verified; certificate remains missing.
- Live Auth/Storage/Realtime/browser integration: not rerun for this change.

After downloading the project's CA certificate, set `SUPABASE_DB_CA_FILE` in ignored `.env.local`, then run:

```sh
npm run db:inspect
npm run db:migrate
```

The custom runner supports empty projects and installations already tracked in `private.localkart_migrations`. An installation created manually in SQL Editor or by Supabase CLI is untracked by this custom tool: inspect it, then use its original deployment method for the new migration rather than rerunning the initial SQL.

For SQL Editor deployment, an empty development project needs migration `001` and then `002`. If `001` is already installed, run **only `002`**, once, in a transaction (`BEGIN; … COMMIT;`). Review existing phone duplicates/invalid numbers and inconsistent line totals first. Do not reset a live database to apply these changes.

The current relationship diagram is in [`DATABASE.md`](DATABASE.md).

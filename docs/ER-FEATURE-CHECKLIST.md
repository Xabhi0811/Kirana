# Kirana diagram: feature audit and completion

Historical checklist: its hosted-schema warning is superseded by [the current live audit](PROJECT-CHECK-REPORT.md). Use all pending migrations, not only migrations 001–003.

## Result

Checked the supplied diagram against database migrations, page routes, forms, API handlers and permission tests. Core marketplace features existed; the missing UI/API features listed below are now implemented in the repository. This is **not** a claim that hosted Supabase is ready: a new read-only check still returned `PGRST205` for `public.users` and `public.categories`.

## Feature checklist

“Implemented” means code/schema exists; live end-to-end verification still requires an installed development database and working email delivery.

| Diagram area        | Features checked                                                                                          | Repository evidence / outcome                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User management     | Signup, login/logout, password reset, profile/avatar, roles, status, unique phone                         | `account-pages.tsx`, `validation.ts`, Auth API, guarded profiles; migrations 001/002. Implemented; Supabase owns credentials.                                                                                 |
| Addresses           | Multiple customer addresses, edit/delete, default selection, delivery address and coordinates             | `AddressesPage`, address API and `save_address` RPC. Implemented for customers; shop public addresses are separate.                                                                                           |
| Shops               | Create/manage, category/contact/address, radius, hours, logo, availability, moderation                    | `ManagementPage`, shops API/RLS. Implemented; added logo/contact rendering on detail and an external OpenStreetMap location link.                                                                             |
| Products            | Add/edit, price, stock, image, active/inactive, shop/category ownership                                   | Product management/API/Storage and SQL constraints. Implemented.                                                                                                                                              |
| Categories          | Hierarchy, name, description, image, browse                                                               | Existing hierarchy/search; added admin category-image upload/edit validation, Storage policy and homepage image rendering.                                                                                    |
| Discovery           | Search products/shops, distance, category/location filtering, price/rating/distance sorting, availability | `discovery.tsx`, discovery RPCs, delivery-radius checks and trigram indexes. Implemented.                                                                                                                     |
| Price comparison    | Same product across shops, listing price and shop/distance                                                | `/compare`, package-unit/brand filters, variant-aware cheapest label. Implemented.                                                                                                                            |
| Shopping lists/cart | Multiple products, same/different shops, save for later, share via chat, convert to order                 | Persistent list tables/UI, structured snapshots in chat, list resolution and cart confirmation. Implemented; each order/cart is single-shop.                                                                  |
| Orders/items        | Place, details, multiple items, tracking, accept/reject/cancel/history                                    | Order pages/RPCs, snapshots, timeline, price/stock validation and idempotency. Implemented. Rejection is represented by cancellation with a reason, not a separate payment action.                            |
| Chat                | Customer/shop private rooms, text/images/product lists, live updates, read flags                          | Chat UI, membership-based RLS/Storage, structured payloads, Realtime plus polling fallback. Implemented.                                                                                                      |
| Reviews             | 1–5 rating, comment, verified orders                                                                      | Delivered-order-only insertion, one review/order, shop display, keeper/admin views. Added customer `/reviews` history navigation.                                                                             |
| Complaints          | Raise, track, admin resolution                                                                            | Existing order complaint form/API/admin management; added customer `/complaints` page for marketplace/shop complaints and status history list, linked from shop details.                                      |
| Admin management    | Users, shop approval/suspension, products/categories, orders, complaints                                  | Existing admin routes and audit triggers. Implemented; self-promotion prohibited.                                                                                                                             |
| Reports/analytics   | View business activity                                                                                    | Existing dashboard metrics; added `/admin/reports`, bounded 7/30/90-day UTC order cohorts and CSV download with admin-only aggregate RPC.                                                                     |
| Platform settings   | Manage platform information                                                                               | Added `/admin/settings`, singleton RLS-protected settings table, audited admin updates and public homepage marketplace name/announcement/support email. Settings do not override Auth security configuration. |
| Payments            | Online/COD, status, transaction, refunds                                                                  | **Excluded:** conflicts with the earlier explicit zero-payment MVP. No dummy payment system or payment fields added.                                                                                          |

## Intentional model differences

- `auth.users` owns passwords/sessions; public profile names/IDs may differ from the image but represent the same entity. No public `password_hash` was added.
- Shops store a public address and coordinates, not an FK to a keeper's private customer-address record. This avoids mixing private saved-address RLS/lifecycle with public storefront data.
- Approval is a state (`PENDING/APPROVED/REJECTED/SUSPENDED`) rather than a boolean. Shop opening status remains separate.
- Delivery addresses and order prices are snapshotted to preserve history. Optional saved-address references can be cleared without destroying old order information.
- Reviews are optional and unique per delivered order (1:0..1). Order complaints may be many; shop/marketplace complaints may have no order.
- Multi-shop lists are allowed. Mixed-shop orders are not: the ER itself assigns one shop per order.
- “Zero fees” is preserved; payments remain outside scope. Users/admins do not gain access to private chats simply by being admins.

## Changes in this completion pass

1. Added `202609150003_feature_completion.sql`: platform settings, public/admin RLS, timestamp/audit triggers, admin report RPC, order-date index and admin-only category image upload policy.
2. Added `platform-pages.tsx`: settings editor, report table/totals/CSV, customer complaint page and public marketplace notice.
3. Added customer reviews/support and admin reports/settings routes/navigation, with server role checks.
4. Added category image form/schema/type support and homepage display.
5. Added shop detail map link, published logo and contact display; shop problem link opens the customer complaint form with its shop reference.
6. Updated database/API/setup documentation and missing-schema message to include migration 003.
7. Added PostgreSQL/validation tests for settings RLS/auditing, report permissions/range, category image Storage permissions and form validation. Added API-fixture browser checks for category/announcement rendering and shop map/contact UI.

No framework replacement, extra payment package or service-role browser key was added. The original migrations remain unchanged; changes are incremental. Reports use creation-date cohorts with current order statuses, and display delivered order value—not money collected or payment revenue.

## Deployment and verification

For an empty development project, apply migrations **001 → 002 → 003**, once each in a transaction. For an existing installation, apply only pending migrations. Do not rerun initial SQL, wipe accounts or reset a live database. Existing Auth-only accounts may require a reviewed profile backfill.

The custom runner supports its own checksum-tracked installations. SQL Editor/CLI installations should keep their original deployment method. Automatic PostgreSQL deployment still needs a verified Supabase CA certificate via `SUPABASE_DB_CA_FILE`.

Local PostgreSQL/validation suite: **22 tests passed**. Desktop/mobile browser smoke suite: **10 passed**, including API-fixture checks for the new category/announcement/map/contact UI. Production build and lint passed. Hosted read-only checks: public key/Auth settings accepted, but core tables not exposed (`PGRST205`). Live two-user Auth/order/chat integration remains unverified; do not interpret fixture browser tests as a hosted-database test.

Related: [database ER](DATABASE.md), [previous schema review](ER-REVIEW-AND-CHANGES.md), [Supabase troubleshooting](SUPABASE-TROUBLESHOOTING.md).

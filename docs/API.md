# Kirana API

Feature-completion endpoints: `GET /api/platform-settings` returns public marketplace information; `POST/PATCH /api/platform-settings` updates it for admins only. `GET /api/reports?days=30` returns UTC order-date cohorts for admins (1–90 days). `/api/upload` accepts the additional `category-images` bucket for admins only. Category create/edit accepts nullable `image_url`.

All routes use JSON except multipart image uploads. Supabase SSR cookies identify the user; RLS and server-side role checks protect private operations. POST mutations check request origin. Errors return `{ "error": "friendly message" }` with 400/401/403/404/503. Lists are paginated at 24 rows; chat messages at 50, newest first.

| Endpoint                                                                        | Methods           | Purpose                                                       |
| ------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- |
| `/api/auth/{register,login,logout,forgot-password,reset-password,update-email}` | POST              | Auth; public signup only CUSTOMER/SHOPKEEPER                  |
| `/api/profile`                                                                  | GET, POST         | Own profile; name, phone, avatar_url                          |
| `/api/categories`                                                               | GET               | Public hierarchical categories, 100 per page                  |
| `/api/search/{shops,products}`                                                  | GET               | Eligible nearby results/comparison                            |
| `/api/shops/:id`, `/api/products/:id`                                           | GET               | Delivery-eligible detail                                      |
| `/api/shop-reviews/:shop`                                                       | GET               | Verified reviews                                              |
| `/api/addresses`, `/api/addresses/:id`                                          | GET, POST, DELETE | Own address CRUD/default                                      |
| `/api/lists`, `/api/lists/:id`                                                  | GET, POST, DELETE | Own lists with items; create/rename/delete                    |
| `/api/lists/:id/resolve`                                                        | POST              | Match own list to shop catalog; returns products/missing      |
| `/api/list-items`, `/api/list-items/:id`                                        | POST, DELETE      | Own items: list_id, product_id nullable, name, quantity, unit |
| `/api/chat`                                                                     | GET, POST         | Private summaries; open room by shop_id                       |
| `/api/chat/:room/messages`                                                      | GET, POST         | Private messages                                              |
| `/api/chat/:room/read`                                                          | POST              | Read receipts for other participant's messages                |
| `/api/orders`, `/api/orders/:id`                                                | GET, POST         | Visible orders/timelines; placement/status transitions        |
| `/api/reviews`, `/api/reviews/:id`                                              | GET, POST, DELETE | Verified review creation; admin removal                       |
| `/api/complaints`, `/api/complaints/:id`                                        | GET, POST         | Own complaints; admin status updates                          |
| `/api/manage/{shops,products,categories,users}`                                 | GET, POST         | Owner/admin CRUD; categories/users admin only                 |
| `/api/manage/products/:id`, `/api/manage/categories/:id`                        | DELETE            | Deactivate product; remove unused category                    |
| `/api/manage/audit_logs`                                                        | GET               | Admin audit trail                                             |
| `/api/stats`                                                                    | GET               | Role-scoped database aggregates                               |
| `/api/upload`                                                                   | POST              | Multipart file, bucket, optional room                         |

Search parameters: required `lat`,`lng`; optional `q`,`category` UUID (includes descendants),`unit`,`brand`,`in_stock=true`,`open_only=true`,`sort=price|distance|rating|name`,`shop` UUID (product search), zero-based `page`. Product Compare links preserve brand/unit so different package sizes are not presented as identical products. Filters and distance calculations run before SQL pagination.

Order input: `shop_id`, `address_id`, `request_id` UUID reused on retries, `notes`, `items:[{product_id,quantity,expected_price}]`. PostgreSQL compares expected prices to live listings and calculates totals itself. No payment fields are accepted. Status updates use `{status,note}`.

Chat input: `message_type` TEXT/IMAGE/PRODUCT/PRODUCT_LIST/ORDER, `message`, optional `reference_id` or `image_path`. Structured payloads come from authorized database records; callers cannot inject arbitrary list/order snapshots. Image paths must belong to the sender and room. Downloads use signed URLs from the private Storage bucket.

List resolution input: `{shop_id,latitude,longitude}`. Matching uses referenced products or exact names/units, combines duplicate quantities, and reports missing/insufficient stock rather than silently dropping items.

Cart uses account-scoped Zustand local persistence. Orders always revalidate it server-side. Realtime subscribes to RLS-protected messages, orders and tracking.

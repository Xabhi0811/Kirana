# 🛒 Kirana — Your Neighbourhood, Online

**Kirana** is a full-stack, hyperlocal marketplace web application built with **Next.js 16**, **React 19**, **MongoDB (Mongoose)**, and **TypeScript**. It connects customers with nearby *kirana* (neighbourhood grocery) shops, enabling product discovery, price comparison, order placement, real-time chat, shopping lists, reviews, complaints, and full admin/shopkeeper management — all with **zero delivery or handling fees**.

This README describes the checked-in code. MongoDB is the active backend; Supabase SQL is historical. See the implementation gaps section for behavior that is incomplete or not fully enforced.

---

## Table of Contents

- [Features Overview](#features-overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Models (MongoDB / Mongoose)](#data-models-mongodb--mongoose)
  - [Entity-Relationship Diagram](#entity-relationship-diagram)
  - [Order Lifecycle State Machine](#order-lifecycle-state-machine)
  - [Authentication Flow](#authentication-flow)
  - [System Architecture & Data Flow](#system-architecture--data-flow)
  - [Shop & Product Discovery Pipeline](#shop--product-discovery-pipeline)
  - [Order Placement Flow](#order-placement-flow)
  - [Chat System Architecture](#chat-system-architecture)
  - [User Role Access Matrix](#user-role-access-matrix)
  - [File Upload Pipeline](#file-upload-pipeline)
  - [Shopping List Resolve-to-Cart Flow](#shopping-list-resolve-to-cart-flow)
- [Authentication & Authorization](#authentication--authorization)
- [API Endpoints Reference](#api-endpoints-reference)
- [Client-Side State Management](#client-side-state-management)
- [UI Components Deep Dive](#ui-components-deep-dive)
- [Pages & Routing](#pages--routing)
- [Key Business Logic](#key-business-logic)
- [Google Maps & Location Services](#google-maps--location-services)
- [Validation Layer (Zod)](#validation-layer-zod)
- [Custom Hooks](#custom-hooks)
- [Database Seed Script](#database-seed-script)
- [Testing](#testing)
- [Security](#security)
- [Environment Variables](#environment-variables)
- [Setup & Installation](#setup--installation)
- [Running the App](#running-the-app)
- [Quality Checks](#quality-checks)
- [Demo Accounts](#demo-accounts)
- [Runtime Scope and Historical Files](#runtime-scope-and-historical-files)
- [API Contract and Request Examples](#api-contract-and-request-examples)
- [Known Implementation Gaps](#known-implementation-gaps)
- [Deployment and Troubleshooting](#deployment-and-troubleshooting)

---

## Features Overview

| Role | Features |
|---|---|
| **Customer** | Browse nearby shops · Search & filter products · Compare prices across shops · Add to cart & place orders · Shopping lists (with auto-resolve to cart) · Real-time chat with shops · Leave reviews · File complaints · Manage addresses · Google Maps location picker |
| **Shopkeeper** | Dashboard with live stats · Register & manage shops · Product & inventory management · Order lifecycle management (accept → prepare → deliver) · Chat with customers · View reviews |
| **Admin** | Platform dashboard with aggregate metrics · User management (activate/suspend) · Shop approval workflow · Category management · Order & complaint oversight · Platform settings · Reports & analytics · Audit logs |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                      Browser                         │
│  React 19 + Zustand store + Tailwind CSS v4          │
│  Google Maps JS API · Location picker                │
└──────────────────┬───────────────────────────────────┘
                   │  fetch → /api/*
┌──────────────────▼───────────────────────────────────┐
│               Next.js 16 (App Router)                │
│  Server Components · Route Handlers · RSC Auth       │
│  Catch-all API: /api/[...path]/route.ts              │
│  JWT auth (jose) · bcryptjs password hashing         │
│  sharp image processing · Zod validation             │
└──────────────────┬───────────────────────────────────┘
                   │  Mongoose ODM
┌──────────────────▼───────────────────────────────────┐
│                    MongoDB                           │
│  17 models · indexes · geospatial queries       │
└──────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

- **Single API route handler** — all CRUD operations are routed through one catch-all `[...path]/route.ts` that dispatches by URL segments and HTTP method.
- **No ORM migrations** — Mongoose schemas auto-create collections and indexes on first connection.
- **Custom JWT auth** — no third-party auth provider; bcryptjs for passwords, jose for JWT tokens, httpOnly cookies for sessions.
- **Polling-based realtime** — the `useRealtime` hook polls every 5 seconds instead of WebSockets, keeping the infrastructure simple.
- **Local file storage** — uploaded images are saved to `public/uploads/` and served as static assets.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 16 (App Router) | SSR, RSC, API routes |
| UI | React 19 | Component rendering |
| Language | TypeScript 5.7 | Type safety |
| Styling | Tailwind CSS v4 + shadcn/ui (New York) | Design system |
| Database | MongoDB + Mongoose 9 | Data persistence |
| Auth | jose (JWT) + bcryptjs | Token signing, password hashing |
| Validation | Zod 4 | Schema validation for all inputs |
| State | Zustand 5 | Client-side cart, location, user |
| Forms | react-hook-form + @hookform/resolvers | Form management & validation |
| Maps | @googlemaps/js-api-loader | Google Maps & Places integration |
| Images | sharp | Server-side image validation |
| Icons | lucide-react | Icon system |
| Testing | Playwright + Node test runner | E2E & unit tests |

---

## Project Structure

```
kirana/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (Shell + auth)
│   │   ├── page.tsx                  # Home page (→ HomePage component)
│   │   ├── error.tsx                 # Error boundary
│   │   ├── loading.tsx               # Loading skeleton
│   │   ├── not-found.tsx             # 404 page
│   │   ├── globals.css               # All CSS (~40KB, Tailwind v4 + custom)
│   │   ├── [...segments]/page.tsx    # Dynamic catch-all page router
│   │   ├── [[...segments]]/          # Optional catch-all (empty)
│   │   ├── api/
│   │   │   ├── [...path]/route.ts    # ★ Main API handler
│   │   │   ├── locate/route.ts       # IP geolocation endpoint
│   │   │   └── places/route.ts       # Google Places proxy
│   │   └── auth/
│   │       ├── google/route.ts       # Google OAuth initiation
│   │       ├── callback/route.ts     # Google OAuth callback
│   │       └── confirm/route.ts      # Legacy email confirm redirect
│   ├── components/
│   │   ├── shell.tsx                 # App shell (sidebar, nav, header, footer)
│   │   ├── discovery.tsx             # Home, search, compare pages
│   │   ├── product-card.tsx          # Product & shop card components
│   │   ├── shop-pages.tsx            # Shop detail & product detail pages
│   │   ├── account-pages.tsx         # Login, register, profile, addresses
│   │   ├── order-pages.tsx           # Cart, checkout, orders, order detail
│   │   ├── list-pages.tsx            # Shopping lists management
│   │   ├── chat-page.tsx             # Customer ↔ shop messaging
│   │   ├── management-pages.tsx      # Shopkeeper/admin CRUD tables
│   │   ├── platform-pages.tsx        # Platform settings, reports, complaints
│   │   ├── entity-form.tsx           # Generic CRUD form (shops/products/categories)
│   │   ├── location-picker.tsx       # Location selection + Google Places
│   │   ├── google-map.tsx            # Google Maps component
│   │   ├── feedback.tsx              # Toast, Loading, Empty, Failure states
│   │   └── ui/                       # shadcn/ui primitives
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       └── skeleton.tsx
│   ├── hooks/
│   │   ├── use-query.ts              # Data fetching hook with refresh
│   │   └── use-realtime.ts           # Polling-based data refresh
│   ├── lib/
│   │   ├── models/index.ts           # ★ All Mongoose schemas & models
│   │   ├── types.ts                  # TypeScript interfaces for all entities
│   │   ├── validation.ts             # Zod schemas for every endpoint
│   │   ├── db.ts                     # MongoDB connection (cached singleton)
│   │   ├── auth.ts                   # Server-side auth helpers (currentProfile, requireRole)
│   │   ├── auth-utils.ts             # JWT signing/verification, cookie management
│   │   ├── store.ts                  # Zustand store (cart, location, owner)
│   │   ├── api-client.ts             # Client-side fetch wrapper
│   │   ├── service-errors.ts         # Error classification & user-friendly messages
│   │   ├── utils.ts                  # Formatting (money, date, label, distance, nextStatus)
│   │   └── brand.ts                  # Brand name constants & display logic
│   └── proxy.ts                      # Middleware pass-through
├── database/
│   └── scripts/
│       └── seed-mongo.ts             # Demo data seeder
├── tests/
│   ├── brand.test.ts                 # Brand name unit tests
│   ├── database.test.ts              # DB connection tests
│   ├── service-errors.test.ts        # Error handling tests
│   ├── validation.test.ts            # Zod schema tests
│   └── browser/
│       ├── smoke.spec.ts             # Basic smoke tests
│       ├── demo.spec.ts              # Full workflow E2E tests
│       ├── marketplace.spec.ts       # Marketplace integration tests
│       ├── branding.spec.ts          # Branding tests
│       └── security.spec.ts          # Security scenarios
├── public/uploads/                   # User-uploaded images (gitignored)
├── .env.example                      # Environment variable template
├── next.config.ts                    # Next.js config (security headers, images)
├── playwright.config.ts              # Playwright test config
├── components.json                   # shadcn/ui config (New York style, stone base)
├── package.json                      # Dependencies & scripts
└── tsconfig.json                     # TypeScript config
```

---

## Data Models (MongoDB / Mongoose)

All models are defined in `src/lib/models/index.ts`. Each uses a `getModel()` helper to prevent re-compilation during Next.js hot-reload.

### Entity-Relationship Diagram

The 17 entities below are MongoDB models. `FK` denotes a logical ObjectId reference, not a database-enforced SQL foreign key. Optional links and snapshots are intentional. Index declarations must be verified on the running database.

```mermaid
erDiagram
    User {
        ObjectId _id PK
        string name "2-100 chars"
        string email UK "lowercase, unique"
        string phone UK "sparse unique, 10-15 digits"
        enum role "CUSTOMER | SHOPKEEPER | ADMIN"
        string avatar_url "profile picture URL"
        string profile_image "save hook fills missing image alias"
        enum status "ACTIVE | INACTIVE | SUSPENDED"
        string password_hash "bcrypt 12 rounds, null for OAuth"
        string google_id UK "sparse unique, Google OAuth"
        Date created_at "auto"
        Date updated_at "auto"
    }

    Category {
        ObjectId _id PK
        string name UK "unique, max 100"
        string description "max 1000"
        string image_url "category icon"
        ObjectId parent_id FK "self-ref for hierarchy"
        Date created_at "auto"
        Date updated_at "auto"
    }

    Address {
        ObjectId _id PK
        ObjectId user_id FK "owner of this address"
        string label "Home, Office, etc. max 40"
        string full_address "max 500"
        float latitude "-90 to 90"
        float longitude "-180 to 180"
        string city "max 100"
        string state "max 100"
        string pincode "6-digit Indian PIN"
        boolean is_default "API clears other defaults; no unique constraint"
        Date created_at "auto"
        Date updated_at "auto"
    }

    Shop {
        ObjectId _id PK
        ObjectId owner_id FK "shopkeeper User._id"
        ObjectId category_id FK "primary shop category"
        string name "2-120 chars"
        string description "max 2000"
        string logo_url "shop logo image"
        string phone "max 20"
        string email "optional contact"
        ObjectId address_id FK "linked Address"
        string address "text address, max 500"
        float latitude "shop location"
        float longitude "shop location"
        float delivery_radius_km "0.01-50 km"
        string open_time "HH:MM format"
        string close_time "HH:MM format"
        enum status "OPEN | CLOSED | INACTIVE"
        enum approval_status "PENDING | APPROVED | REJECTED | SUSPENDED"
        Date created_at "auto"
        Date updated_at "auto"
    }

    Product {
        ObjectId _id PK
        ObjectId shop_id FK "belongs to Shop"
        ObjectId category_id FK "product category"
        string name "2-150 chars"
        string description "max 2000"
        string brand "max 100"
        string unit "1 kg, 500 ml, etc."
        float price "INR, 0-10M"
        int stock_quantity "0-1M, decremented on order"
        string image_url "primary product image"
        boolean is_active "soft-delete flag"
        Date created_at "auto"
        Date updated_at "auto"
    }

    ProductImage {
        ObjectId _id PK
        ObjectId product_id FK "parent Product"
        string image_url "image URL"
        boolean is_primary "not uniquely constrained"
        Date created_at "auto"
    }

    ShoppingList {
        ObjectId _id PK
        ObjectId user_id FK "customer who created it"
        string name "list name, max 100"
        Date created_at "auto"
        Date updated_at "auto"
    }

    ShoppingListItem {
        ObjectId _id PK
        ObjectId list_id FK "parent ShoppingList"
        ObjectId product_id FK "optional linked Product"
        string name "item name, max 150"
        string product_name "synced with name via hook"
        int quantity "1-999"
        string unit "item, kg, etc."
        Date created_at "auto"
        Date updated_at "auto"
    }

    Order {
        ObjectId _id PK
        string order_number UK "auto LK-XXXX hex"
        ObjectId customer_id FK "who placed order"
        ObjectId shop_id FK "target shop"
        ObjectId address_id FK "delivery address ref"
        mixed delivery_address "snapshot of Address at order time"
        enum status "PLACED-ACCEPTED-PREPARING-OUT_FOR_DELIVERY-DELIVERED-CANCELLED"
        float total_amount "calculated from items"
        string notes "customer notes, max 2000"
        string request_key "unique together with customer_id"
        Date created_at "auto"
        Date updated_at "auto"
    }

    OrderItem {
        ObjectId _id PK
        ObjectId order_id FK "parent Order"
        ObjectId product_id FK "product snapshot"
        string product_name "name + unit at order time"
        float unit_price "price at order time"
        int quantity "1-999"
        float total_price "unit_price x quantity"
    }

    OrderTracking {
        ObjectId _id PK
        ObjectId order_id FK "parent Order"
        string status "status at this point"
        string note "optional note, max 1000"
        ObjectId updated_by FK "User who changed status"
        Date created_at "timestamp of change"
    }

    Review {
        ObjectId _id PK
        ObjectId order_id FK "unique - one review per order"
        ObjectId customer_id FK "who wrote the review"
        ObjectId shop_id FK "shop being reviewed"
        int rating "1 to 5 stars"
        string comment "max 2000"
        Date created_at "auto"
        Date updated_at "auto"
    }

    Complaint {
        ObjectId _id PK
        ObjectId order_id FK "optional related order"
        ObjectId user_id FK "who filed complaint"
        ObjectId shop_id FK "optional related shop"
        string subject "max 150"
        string description "max 4000"
        enum status "OPEN | IN_PROGRESS | RESOLVED | CLOSED"
        Date created_at "auto"
        Date updated_at "auto"
    }

    ChatRoom {
        ObjectId _id PK
        ObjectId customer_id FK "customer in chat"
        ObjectId shop_id FK "shop in chat"
        Date created_at "auto"
        Date updated_at "last message time"
    }

    ChatMessage {
        ObjectId _id PK
        ObjectId chat_room_id FK "parent ChatRoom"
        ObjectId sender_id FK "User who sent message"
        string message "text content, max 4000"
        enum message_type "TEXT | IMAGE | PRODUCT | PRODUCT_LIST | ORDER"
        mixed payload "rich content: product details, list items, order ref"
        boolean is_read "read receipt"
        Date created_at "sent time"
    }

    AuditLog {
        ObjectId _id PK
        ObjectId actor_id FK "admin or system User"
        string resource "collection name"
        ObjectId resource_id "affected document ID"
        string action "CREATE | UPDATE | DELETE"
        mixed changes "before and after snapshots"
        Date created_at "action time"
    }

    PlatformSettings {
        ObjectId _id PK
        string marketplace_name "default: LocalKart"
        string support_email "admin contact"
        string announcement "global banner text"
        Date updated_at "last changed"
    }

    %% ═══════════════════════════════════════════
    %% USER RELATIONSHIPS (Customer / Shopkeeper / Admin)
    %% ═══════════════════════════════════════════

    User ||--o{ Address : "saves delivery addresses"
    User ||--o{ Shop : "owns as shopkeeper"
    User ||--o{ ShoppingList : "creates grocery lists"
    User ||--o{ Order : "places as customer"
    User ||--o{ Review : "writes after delivery"
    User ||--o{ Complaint : "files for support"
    User o|--o{ AuditLog : "admin actions logged"

    %% ═══════════════════════════════════════════
    %% CATEGORY HIERARCHY
    %% ═══════════════════════════════════════════

    Category o|--o{ Category : "parent has subcategories"
    Category ||--o{ Shop : "shop primary category"
    Category ||--o{ Product : "product category"

    %% ═══════════════════════════════════════════
    %% SHOP ECOSYSTEM
    %% ═══════════════════════════════════════════

    Address o|--o{ Shop : "optional shop address reference"
    Shop ||--o{ Product : "shop inventory"
    Shop ||--o{ Order : "receives customer orders"
    Shop ||--o{ Review : "rated by customers"
    Shop o|--o{ Complaint : "complaints about shop"
    Shop ||--o{ ChatRoom : "customer conversations"

    %% ═══════════════════════════════════════════
    %% PRODUCT & IMAGES
    %% ═══════════════════════════════════════════

    Product ||--o{ ProductImage : "gallery images"
    Product ||--o{ OrderItem : "purchased in orders"
    Product o|--o{ ShoppingListItem : "referenced in lists"

    %% ═══════════════════════════════════════════
    %% SHOPPING LIST SYSTEM
    %% ═══════════════════════════════════════════

    ShoppingList ||--o{ ShoppingListItem : "list contains items"

    %% ═══════════════════════════════════════════
    %% ORDER LIFECYCLE
    %% ═══════════════════════════════════════════

    Order ||--o{ OrderItem : "line items with prices"
    Order ||--o{ OrderTracking : "status change history"
    Order ||--o| Review : "one review per delivered order"
    Order o|--o{ Complaint : "complaints about order"
    Address o|--o{ Order : "optional reference plus stored snapshot"

    %% ═══════════════════════════════════════════
    %% CHAT SYSTEM
    %% ═══════════════════════════════════════════

    ChatRoom ||--o{ ChatMessage : "message thread"
    User ||--o{ ChatRoom : "customer participates"
    User ||--o{ ChatMessage : "sends messages"
    User ||--o{ OrderTracking : "shopkeeper/admin updates status"
```

> **Notation:** `||--o{` one-to-many · `o|--o{` optional parent-to-many · `||--o|` one-to-optional-one · `PK` primary key · `FK` foreign key · `UK` unique key

---

### Order Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> PLACED : Customer places order
    PLACED --> ACCEPTED : Shop owner or admin accepts
    PLACED --> CANCELLED : Customer owner, shop owner or admin

    ACCEPTED --> PREPARING : Shop owner or admin prepares
    ACCEPTED --> CANCELLED : Customer owner, shop owner or admin

    PREPARING --> OUT_FOR_DELIVERY : Shop owner or admin dispatches

    OUT_FOR_DELIVERY --> DELIVERED : Shop owner or admin confirms delivery

    DELIVERED --> [*]
    CANCELLED --> [*]

    note right of PLACED
        Stock is decremented
        Request key supports retry lookup
        Price verified at order time
    end note

    note right of CANCELLED
        Stock is automatically restored
        for all order items
    end note

    note right of DELIVERED
        Customer can now write
        a Review (one per order)
    end note
```

---

### Authentication Flow

```mermaid
flowchart TB
    subgraph "Email/Password Auth"
        A1["/register page"] --> A2["POST /api/auth/register"]
        A2 --> A3["Validate with registerSchema"]
        A3 --> A4["Check email uniqueness"]
        A4 --> A5["bcrypt hash password (12 rounds)"]
        A5 --> A6["Create User document"]
        A6 --> A7["Sign JWT (HS256, 7d expiry)"]
        A7 --> A8["Set httpOnly cookie 'kirana-auth'"]

        B1["/login page"] --> B2["POST /api/auth/login"]
        B2 --> B3["Find User by email"]
        B3 --> B4["bcrypt verify password"]
        B4 --> B5["Check status != SUSPENDED"]
        B5 --> A7
    end

    subgraph "Google OAuth"
        C1["Click 'Continue with Google'"] --> C2["GET /auth/google"]
        C2 --> C3["Redirect to Google consent screen"]
        C3 --> C4["GET /auth/callback?code=xxx"]
        C4 --> C5["Exchange code for access_token"]
        C5 --> C6["Fetch Google userinfo"]
        C6 --> C7{"User exists\nby google_id?"}
        C7 -- Yes --> C9["Use existing User"]
        C7 -- No --> C8{"Email exists\nin DB?"}
        C8 -- Yes --> C10["Link google_id\nto existing User"]
        C8 -- No --> C11["Create new CUSTOMER User"]
        C10 --> C9
        C11 --> C9
        C9 --> C12["Sign JWT + set cookie"]
        C12 --> C13["Redirect to / or /shopkeeper"]
    end

    subgraph "Request Authorization"
        D1["Any API request"] --> D2["Read 'kirana-auth' cookie"]
        D2 --> D3["Verify JWT with jose"]
        D3 --> D4["Load User from MongoDB"]
        D4 --> D5{"status ==\nSUSPENDED?"}
        D5 -- Yes --> D6["403 Forbidden"]
        D5 -- No --> D7{"Role in\nallowed roles?"}
        D7 -- No --> D8["403 Access denied"]
        D7 -- Yes --> D9["Return Profile object"]
    end

    subgraph "Logout"
        E1["POST /api/auth/logout"] --> E2["Clear 'kirana-auth' cookie (maxAge=0)"]
        E2 --> E3["Clear Zustand store (cart, location)"]
    end
```

---

### System Architecture & Data Flow

```mermaid
flowchart TB
    subgraph "Browser (Client)"
        UI["React 19 Components"]
        ZS["Zustand Store\n(cart, location, user)"]
        GM["Google Maps JS API"]
        LP["LocationPicker\n(geolocation + autocomplete)"]
        APC["api() fetch wrapper"]
    end

    subgraph "Next.js Server"
        subgraph "App Router Pages"
            RL["Root Layout\n(Shell + currentProfile)"]
            CA["[...segments]/page.tsx\n(dynamic router)"]
        end

        subgraph "API Routes"
            MAIN["/api/[...path]/route.ts\n(main business API)"]
            LOC["/api/locate\n(IP geolocation)"]
            PLC["/api/places\n(Google Places proxy)"]
            AG["/auth/google\n(OAuth start)"]
            ACB["/auth/callback\n(OAuth callback)"]
        end

        subgraph "Server Libraries"
            AUTH["auth.ts + auth-utils.ts\n(JWT, bcrypt, cookies)"]
            VAL["validation.ts\n(13 Zod schemas)"]
            MOD["models/index.ts\n(16 Mongoose models)"]
            DB["db.ts\n(cached MongoDB connection)"]
            SE["service-errors.ts\n(error classification)"]
            SH["sharp\n(image validation)"]
        end
    end

    subgraph "External Services"
        MONGO[("MongoDB\n17 models")]
        GAPI["Google OAuth API"]
        GMAP["Google Maps/Places API"]
        IPGEO["IP Geolocation APIs\n(ipwho.is, freeipapi, ip-api)"]
    end

    subgraph "File System"
        UPLOADS["public/uploads/\n(avatars, shop-images,\nproduct-images, chat-images,\ncategory-images)"]
    end

    UI --> APC
    UI --> ZS
    UI --> GM
    UI --> LP
    APC --> MAIN
    LP --> LOC
    LP --> PLC
    RL --> AUTH
    CA --> AUTH

    MAIN --> AUTH
    MAIN --> VAL
    MAIN --> MOD
    MAIN --> DB
    MAIN --> SE
    MAIN --> SH
    MAIN --> UPLOADS

    AG --> GAPI
    ACB --> GAPI
    ACB --> AUTH
    ACB --> MOD

    LOC --> IPGEO
    PLC --> GMAP
    GM --> GMAP

    DB --> MONGO
    MOD --> MONGO
```

---

### Shop & Product Discovery Pipeline

```mermaid
flowchart TB
    START["Customer opens app"] --> LOC{"Location\nset?"}
    LOC -- No --> PICK["LocationPicker:\n1. Browser geolocation\n2. IP geolocation (/api/locate)\n3. Manual search (/api/places)\n4. Saved addresses"]
    PICK --> SET["Store location in Zustand"]
    SET --> LOC
    LOC -- Yes --> SEARCH["GET /api/search/products\nor /api/search/shops"]

    SEARCH --> FILTER1["Query MongoDB:\napproval_status=APPROVED\nstatus != INACTIVE\nlat/lng bounding box (±50km)"]

    FILTER1 --> FILTER2["Filter by active owner:\nUser.status = ACTIVE"]

    FILTER2 --> FILTER3{"Category\nfilter?"}
    FILTER3 -- Yes --> HIER["categoryContains() BFS:\nwalk parent→child tree"]
    FILTER3 -- No --> DIST
    HIER --> DIST

    DIST["Haversine distance calculation:\nexclude shops beyond\ndelivery_radius_km"]

    DIST --> ENRICH["Enrich each result:\n- distance (km)\n- avg rating (from Reviews)\n- product count\n- shop name & status"]

    ENRICH --> SORT{"Sort by?"}
    SORT -- distance --> S1["nearest first"]
    SORT -- price --> S2["cheapest first"]
    SORT -- rating --> S3["highest rated first"]
    SORT -- name --> S4["alphabetical"]

    S1 --> PAGE["Paginate: 24 items per page"]
    S2 --> PAGE
    S3 --> PAGE
    S4 --> PAGE

    PAGE --> RESULT["Return enriched JSON array"]

    subgraph "Additional Filters"
        F1["q: text search (regex)"]
        F2["in_stock: stock_quantity > 0"]
        F3["open_only: status = OPEN"]
        F4["unit: exact unit match"]
        F5["brand: exact brand match"]
        F6["shop: specific shop_id"]
    end

    SEARCH -.-> F1
    SEARCH -.-> F2
    SEARCH -.-> F3
    SEARCH -.-> F4
    SEARCH -.-> F5
    SEARCH -.-> F6
```

---

### Order Placement Flow

```mermaid
flowchart TB
    CART["Customer adds products to cart\n(Zustand store)"] --> CHECK1{"Same shop\nas cart?"}
    CHECK1 -- No --> PROMPT["Cross-shop dialog:\nReplace cart?"]
    PROMPT -- Yes --> REPLACE["Clear cart, add new item"]
    PROMPT -- No --> CANCEL["Keep existing cart"]
    CHECK1 -- Yes --> ADDITEM["Add to cart:\ncheck stock, shop status"]

    ADDITEM --> CHECKOUT["/checkout page"]
    REPLACE --> CHECKOUT

    CHECKOUT --> ADDR["Select delivery address\nfrom saved addresses"]
    ADDR --> SUBMIT["POST /api/orders"]

    SUBMIT --> V1["Validate with orderSchema\n(Zod)"]
    V1 --> V2{"Idempotency:\nrequest_key exists?"}
    V2 -- Yes --> RETURN_EXISTING["Return existing order ID"]
    V2 -- No --> V3["Verify shop:\napproved + visible + OPEN"]
    V3 --> V4["Verify address:\nbelongs to user\nwithin delivery_radius_km"]
    V4 --> V5["For each item:\n- product exists & active\n- belongs to shop\n- sufficient stock\n- price matches expected_price"]
    V5 --> CREATE["Create Order document\nwith delivery_address snapshot"]
    CREATE --> ITEMS["Create OrderItem documents\nDecrement stock in separate writes"]
    ITEMS --> TRACK["Create initial OrderTracking\nstatus=PLACED"]
    TRACK --> DONE["Return order ID (201)"]
```

---

### Chat System Architecture

```mermaid
flowchart TB
    subgraph "Chat Message Types"
        TEXT["TEXT\nPlain text message\nmax 4000 chars"]
        IMAGE["IMAGE\npayload: {path}\nUploaded via /api/upload"]
        PRODUCT["PRODUCT\npayload: {id, name, unit,\nprice, stock_quantity}\nAuto-fetched from Product"]
        PRODUCT_LIST["PRODUCT_LIST\npayload: {id, name,\nitems: [{name, qty, unit}]}\nSnapshot of ShoppingList"]
        ORDER_MSG["ORDER\npayload: {id, order_number,\nstatus, total_amount}\nReference to Order"]
    end

    CUSTOMER["Customer"] --> OPEN["POST /api/chat\n{shop_id}\nFind or create ChatRoom"]
    OPEN --> ROOM["ChatRoom\n(unique per customer+shop)"]

    ROOM --> SEND["POST /api/chat/{roomId}/messages\nValidate with messageSchema"]
    SEND --> TEXT
    SEND --> IMAGE
    SEND --> PRODUCT
    SEND --> PRODUCT_LIST
    SEND --> ORDER_MSG

    ROOM --> READ["POST /api/chat/{roomId}/read\nMark all received messages\nis_read=true"]

    ROOM --> POLL["GET /api/chat/{roomId}/messages\nPolled every 5 seconds\nvia useRealtime hook"]

    SHOPKEEPER["Shopkeeper"] --> ROOM
    SHOPKEEPER --> SEND
    SHOPKEEPER --> READ
    SHOPKEEPER --> POLL

    subgraph "Access Control"
        AC1["inChat() verifies:\n- customer_id matches, OR\n- user owns the shop"]
    end

    SEND -.-> AC1
    READ -.-> AC1
    POLL -.-> AC1
```

---

### User Role Access Matrix

```mermaid
flowchart LR
    subgraph "CUSTOMER"
        C1["Browse & search products"]
        C2["Compare prices"]
        C3["Cart & checkout"]
        C4["Place & cancel orders"]
        C5["Shopping lists\n(create, resolve to cart)"]
        C6["Chat with shops"]
        C7["Review delivered orders"]
        C8["File complaints"]
        C9["Manage addresses"]
        C10["Edit profile"]
    end

    subgraph "SHOPKEEPER"
        S1["Dashboard\n(today orders, pending,\nlow stock, rating)"]
        S2["Register shops\n(pending approval)"]
        S3["Manage products\n& inventory"]
        S4["Process orders\n(accept → deliver)"]
        S5["Chat with customers"]
        S6["View reviews"]
        S7["Can browse public marketplace\nCustomer pages remain role-gated"]
    end

    subgraph "ADMIN"
        A1["Platform dashboard\n(users, shops, orders,\nrevenue, complaints)"]
        A2["Manage users\n(activate/suspend)"]
        A3["Shop approval\n(approve/reject/suspend)"]
        A4["Manage categories"]
        A5["Manage all products"]
        A6["View all orders"]
        A7["Handle complaints\n(status transitions)"]
        A8["Reports & analytics\n(daily order report)"]
        A9["Platform settings\n(name, email, announcement)"]
        A10["Audit logs via API"]
        A11["Delete reviews"]
    end
```

---

### File Upload Pipeline

```mermaid
flowchart TB
    UPLOAD["POST /api/upload\nmultipart/form-data"] --> SIZE["Stream body\nmax 4.25 MB"]
    SIZE --> BUCKET{"Valid bucket?"}
    BUCKET -- No --> ERR1["400: Invalid destination"]
    BUCKET -- Yes --> ROLE{"Role check"}
    ROLE -- "category-images\nrequires ADMIN" --> PERM_OK
    ROLE -- "shop/product-images\nrequires SHOPKEEPER" --> PERM_OK
    ROLE -- "avatars, chat-images\nany authenticated user" --> PERM_OK
    ROLE -- "unauthorized" --> ERR2["403: Access denied"]

    PERM_OK --> MAGIC["Check magic bytes:\nPNG: 89 50 4E 47\nJPEG: FF D8 FF\nWebP: RIFF...WEBP"]
    MAGIC --> MIME{"MIME matches\nmagic bytes?"}
    MIME -- No --> ERR3["400: Invalid image format"]
    MIME -- Yes --> SHARP["sharp validates:\n- Not corrupted\n- Under 25M pixels"]
    SHARP -- Fail --> ERR4["400: Image damaged"]
    SHARP -- Pass --> SAVE["Save to:\npublic/uploads/{bucket}/{userId}/{uuid}.{ext}"]
    SAVE --> RESPOND["Return {path, url}"]

    subgraph "5 Upload Buckets"
        B1["avatars"]
        B2["shop-images"]
        B3["product-images"]
        B4["chat-images"]
        B5["category-images"]
    end
```

---

### Shopping List Resolve-to-Cart Flow

```mermaid
flowchart TB
    LIST["Customer has a ShoppingList\nwith ShoppingListItems"] --> SELECT["Select target shop"]
    SELECT --> RESOLVE["POST /api/lists/{id}/resolve\n{shop_id, latitude, longitude}"]

    RESOLVE --> LOOP["For each list item:"]
    LOOP --> SEARCH["discoverProducts()\nsearch by item name\nfilter: shop, in_stock, open"]
    SEARCH --> MATCH{"Product found\nmatching name, unit,\nand sufficient stock?"}
    MATCH -- Yes --> FOUND["Add to 'products' array\nwith quantity"]
    MATCH -- No --> MISSING["Add item name\nto 'missing' array"]

    FOUND --> NEXT["Next item"]
    MISSING --> NEXT
    NEXT --> LOOP

    LOOP --> RESULT["Return:\n{products: [...], missing: [...]}"]
    RESULT --> CLIENT["Client adds 'products'\nto Zustand cart"]
    RESULT --> SHOW["Display 'missing' items\nto customer"]
```

### 1. `User`

| Field | Type | Description |
|---|---|---|
| `name` | String (2–100) | Display name |
| `email` | String (unique, lowercase) | Login identifier |
| `phone` | String (unique, sparse) | Phone number |
| `role` | Enum | `CUSTOMER`, `SHOPKEEPER`, or `ADMIN` |
| `avatar_url` | String | Profile picture URL |
| `profile_image` | String | Synced with `avatar_url` via pre-save hook |
| `status` | Enum | `ACTIVE`, `INACTIVE`, or `SUSPENDED` |
| `password_hash` | String | bcrypt hash (null for Google OAuth users) |
| `google_id` | String (unique, sparse) | Google OAuth subject ID |

**Indexes:** `email` (unique), `phone` (unique sparse), `google_id` (unique sparse)

### 2. `Category`

| Field | Type | Description |
|---|---|---|
| `name` | String (unique, max 100) | Category name |
| `description` | String (max 1000) | Description text |
| `image_url` | String | Category icon/image |
| `parent_id` | ObjectId → Category | Hierarchical parent |

**Indexes:** `parent_id`

### 3. `Address`

| Field | Type | Description |
|---|---|---|
| `user_id` | ObjectId → User | Owner |
| `label` | String (max 40) | "Home", "Office", etc. |
| `full_address` | String (max 500) | Full text address |
| `latitude` / `longitude` | Number | Geo-coordinates |
| `city`, `state`, `pincode` | String | Location parts |
| `is_default` | Boolean | Default delivery address |

**Indexes:** `user_id`

### 4. `Shop`

| Field | Type | Description |
|---|---|---|
| `owner_id` | ObjectId → User | Shopkeeper who owns it |
| `category_id` | ObjectId → Category | Primary category |
| `name` | String (2–120) | Shop name |
| `description` | String (max 2000) | Shop description |
| `logo_url` | String | Shop logo |
| `address` | String | Text address |
| `latitude` / `longitude` | Number | Geo-coordinates |
| `delivery_radius_km` | Number (0.01–50) | Max delivery distance |
| `open_time` / `close_time` | String (HH:MM) | Operating hours |
| `status` | Enum | `OPEN`, `CLOSED`, or `INACTIVE` |
| `approval_status` | Enum | `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` |

**Indexes:** `owner_id`, `address_id`, `(latitude, longitude)`, `name` (text), `category_id`

### 5. `Product`

| Field | Type | Description |
|---|---|---|
| `shop_id` | ObjectId → Shop | Parent shop |
| `category_id` | ObjectId → Category | Product category |
| `name` | String (2–150) | Product name |
| `description` | String (max 2000) | Description |
| `brand` | String (max 100) | Brand name |
| `unit` | String (max 40) | e.g. "1 kg", "500 ml" |
| `price` | Number (0–10M) | Price in INR |
| `stock_quantity` | Number (0–1M) | Available stock |
| `image_url` | String | Primary product image |
| `is_active` | Boolean | Soft-delete flag |

**Indexes:** `shop_id`, `category_id`, `name` (text)

### 6. `ProductImage`

Stores multiple images per product with a `is_primary` flag.

### 7. `ShoppingList` + `ShoppingListItem`

User-created grocery lists with items that can optionally reference a `Product`. The `ShoppingListItem` has a pre-save hook that syncs `name` and `product_name`.

### 8. `Order`

| Field | Type | Description |
|---|---|---|
| `order_number` | String (unique) | Auto-generated `LK-XXXX` format |
| `customer_id` | ObjectId → User | Who placed the order |
| `shop_id` | ObjectId → Shop | Target shop |
| `delivery_address` | Mixed | Snapshot of address at order time |
| `status` | Enum | `PLACED` → `ACCEPTED` → `PREPARING` → `OUT_FOR_DELIVERY` → `DELIVERED` (or `CANCELLED`) |
| `total_amount` | Number | Calculated total |
| `notes` | String | Customer notes |
| `request_key` | String (unique per customer) | Idempotency key to prevent duplicate orders |

**Indexes:** `(customer_id, created_at)`, `(shop_id, created_at)`, `status`, `created_at`, `(customer_id, request_key)` (unique)

### 9. `OrderItem`

Line items within an order: `product_id`, `product_name`, `unit_price`, `quantity`, `total_price`.

### 10. `OrderTracking`

Status change log: `order_id`, `status`, `note`, `updated_by`, `created_at`.

### 11. `Review`

One review per order (enforced by unique `order_id`). Fields: `order_id`, `customer_id`, `shop_id`, `rating` (1–5), `comment`.

### 12. `Complaint`

Customer support tickets: `order_id`, `user_id`, `shop_id`, `subject`, `description`, `status` (OPEN → IN_PROGRESS → RESOLVED → CLOSED).

### 13. `ChatRoom`

Unique `(customer_id, shop_id)` pair. One chat room per customer-shop relationship.

### 14. `ChatMessage`

Messages in chat rooms. Supports types: `TEXT`, `IMAGE`, `PRODUCT`, `PRODUCT_LIST`, `ORDER` — each with a typed `payload`.

### 15. `AuditLog`

Admin action log: `actor_id`, `resource`, `resource_id`, `action`, `changes`.

### 16. `PlatformSettings` (Singleton)

Global settings: `marketplace_name`, `support_email`, `announcement`.

### Utility Functions in Models

- **`distanceKm(lat1, lng1, lat2, lng2)`** — Haversine formula for distance between two coordinates.
- **`categoryContains(parentId, childId)`** — BFS traversal to check if a category is a descendant of another.
- **`ensurePlatformSettings()`** — Lazy-creates the singleton settings document.

---

## Authentication & Authorization

### Password Auth Flow

1. **Register** (`POST /api/auth/register`) → Validates via `registerSchema` → Hashes password with bcryptjs (12 rounds) → Creates `User` document → Signs JWT → Sets `kirana-auth` httpOnly cookie (7-day expiry).
2. **Login** (`POST /api/auth/login`) → Finds user by email → Verifies password hash → Checks account status → Signs JWT → Sets cookie.
3. **Logout** (`POST /api/auth/logout`) → Clears the auth cookie.

### Google OAuth Flow

1. `GET /auth/google` → Redirects to Google OAuth consent screen.
2. Google redirects to `GET /auth/callback` with authorization code.
3. Callback exchanges code for access token → Fetches user profile from Google → Finds or creates `User` (links Google ID to existing email accounts) → Signs JWT → Sets cookie → Redirects to `/` or `/shopkeeper`.

### JWT Token Structure

- Algorithm: HS256
- Payload: `{ sub: userId }`
- Expiry: 7 days
- Secret: `JWT_SECRET` env var

### Role-Based Access

The `actor(roles?)` function in the API route:

1. Reads JWT from cookie → Finds user in DB
2. Checks `SUSPENDED` status → throws 403
3. Checks role against allowed roles → throws 403
4. Returns the `Profile` object

Server components use `requireRole(roles)` which redirects to `/login` or `/` if unauthorized.

### Key Auth Functions

| Function | File | Purpose |
|---|---|---|
| `hashPassword(password)` | `auth-utils.ts` | bcrypt hash with 12 rounds |
| `verifyPassword(password, hash)` | `auth-utils.ts` | bcrypt compare |
| `signToken(userId)` | `auth-utils.ts` | Create HS256 JWT |
| `verifyToken(token)` | `auth-utils.ts` | Verify & decode JWT |
| `setAuthCookie(userId)` | `auth-utils.ts` | Sign JWT + set httpOnly cookie |
| `getAuthUserId()` | `auth-utils.ts` | Read cookie → verify → return userId |
| `clearAuthCookie()` | `auth-utils.ts` | Expire the auth cookie |
| `currentProfile()` | `auth.ts` | Get current user's Profile (or null) |
| `requireRole(roles)` | `auth.ts` | Server-side role gate (redirects on failure) |
| `configured()` | `auth.ts` | Returns true if `MONGODB_URI` is set |

---

## API Endpoints Reference

Most business endpoints are handled by the catch-all route at `src/app/api/[...path]/route.ts`. The URL pattern is `/api/{resource}/{target}/{action}`.

### Public Endpoints (No Auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/categories` | List categories (up to 100, paginated offset) |
| `GET` | `/api/platform-settings` | Get marketplace name, support email, announcement |
| `GET` | `/api/search/shops?lat=&lng=&...` | Discover nearby shops |
| `GET` | `/api/search/products?lat=&lng=&...` | Search products across nearby shops |
| `GET` | `/api/shops/{id}?lat=&lng=` | Get single shop details (if within delivery radius) |
| `GET` | `/api/products/{id}?lat=&lng=` | Get single product details |
| `GET` | `/api/shop-reviews/{shopId}` | List reviews for a shop |
| `GET` | `/api/locate` | IP-based geolocation |
| `GET` | `/api/places?input=&placeId=&geocode=` | Google Places proxy |

### Auth Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `POST` | `/api/auth/reset-password` | Change password (authenticated) |
| `POST` | `/api/auth/update-email` | Change email (authenticated) |
| `GET` | `/auth/google` | Initiate Google OAuth |
| `GET` | `/auth/callback` | Google OAuth callback |
| `GET` | `/auth/confirm` | Legacy confirmation redirect to login |

### Signed-in Marketplace Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/profile` | Get own profile |
| `POST` | `/api/profile` | Update name, phone, avatar |
| `GET` | `/api/addresses` | List own addresses |
| `POST` | `/api/addresses` | Create address |
| `POST` | `/api/addresses/{id}` | Update address |
| `DELETE` | `/api/addresses/{id}` | Delete address |
| `GET` | `/api/lists` | List shopping lists with items |
| `POST` | `/api/lists` | Create shopping list |
| `POST` | `/api/lists/{id}` | Rename shopping list |
| `DELETE` | `/api/lists/{id}` | Delete shopping list + items |
| `POST` | `/api/lists/{id}/resolve` | Auto-match list items to shop products |
| `POST` | `/api/list-items` | Add item to list |
| `POST` | `/api/list-items/{id}` | Update list item |
| `DELETE` | `/api/list-items/{id}` | Remove list item |
| `GET` | `/api/orders` | List own orders (with items & tracking) |
| `GET` | `/api/orders/{id}` | Get order details |
| `POST` | `/api/orders` | Place new order |
| `POST` | `/api/orders/{id}` | Update order status (cancel) |
| `GET` | `/api/chat` | List chat rooms with unread counts |
| `GET` | `/api/chat/{roomId}/messages` | Get messages in room |
| `POST` | `/api/chat` | Open/get chat room with a shop |
| `POST` | `/api/chat/{roomId}/messages` | Send message |
| `POST` | `/api/chat/{roomId}/read` | Mark messages as read |
| `GET` | `/api/reviews` | List own reviews |
| `POST` | `/api/reviews` | Submit review for delivered order |
| `DELETE` | `/api/reviews/{id}` | Delete review (admin only) |
| `GET` | `/api/complaints` | List own complaints |
| `POST` | `/api/complaints` | File a complaint |
| `POST` | `/api/upload` | Upload image (multipart/form-data) |

### Shopkeeper Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stats` | Dashboard stats (today's orders, pending, low stock, etc.) |
| `GET` | `/api/manage/shops` | List own shops |
| `POST` | `/api/manage/shops` | Create shop (status: PENDING) |
| `POST` | `/api/manage/shops/{id}` | Update shop details |
| `GET` | `/api/manage/products` | List own products |
| `POST` | `/api/manage/products` | Create product |
| `POST` | `/api/manage/products/{id}` | Update product |
| `DELETE` | `/api/manage/products/{id}` | Soft-delete product (is_active=false) |

### Admin Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stats` | Platform-wide stats |
| `GET` | `/api/reports?days=` | Daily order report (up to 90 days) |
| `GET` | `/api/manage/users` | List all users |
| `POST` | `/api/manage/users/{id}` | Activate/suspend user |
| `GET` | `/api/manage/shops` | List all shops |
| `POST` | `/api/manage/shops/{id}` | Approve/reject/suspend shop |
| `GET` | `/api/manage/categories` | List categories (paginated) |
| `POST` | `/api/manage/categories` | Create category |
| `POST` | `/api/manage/categories/{id}` | Update category |
| `DELETE` | `/api/manage/categories/{id}` | Delete category |
| `GET` | `/api/manage/audit_logs` | View audit trail |
| `POST/PATCH` | `/api/platform-settings` | Update marketplace settings |
| `POST` | `/api/complaints/{id}` | Update complaint status |

---

## Client-Side State Management

### Zustand Store (`src/lib/store.ts`)

The store is persisted to `localStorage` under key `"localkart"`.

| State | Type | Purpose |
|---|---|---|
| `location` | `Location \| null` | User's selected delivery location |
| `owner` | `string \| null` | Current user's ID (clears cart on user change) |
| `shopId` | `string \| null` | Shop the cart belongs to |
| `shopName` | `string` | Display name of cart's shop |
| `items` | `CartItem[]` | Cart items array |

### Store Actions

| Action | Logic |
|---|---|
| `setLocation(location)` | Updates delivery location |
| `setOwner(owner)` | If user changes, clears entire cart |
| `add(product, replace?)` | Returns `"added"`, `"cross-shop"`, or `"unavailable"`. Checks stock, shop status. If different shop, prompts to replace cart |
| `quantity(id, q)` | Updates quantity. Removes item if `q < 1`. Caps at stock/999 |
| `clear()` | Empties cart, resets shop |

### API Client (`src/lib/api-client.ts`)

```typescript
api<T>(path, body?, method?): Promise<T>
```
Wrapper around `fetch("/api/" + path)` — auto-detects GET vs POST by presence of body, parses JSON response, throws on error.

---

## UI Components Deep Dive

### `Shell` — App Layout (`shell.tsx`)

- **Server → Client bridge**: Root layout passes `profile` (from `currentProfile()`) and `connected` flag.
- **Sidebar navigation**: Three sets of nav links — customer, shopkeeper, admin — auto-selected by route and role.
- **Header**: Mobile menu toggle + `LocationPicker` + sign-in link + cart badge.
- **Profile section**: Avatar (initials), name, role, logout button.
- **Connection banner**: Shown when MongoDB is not configured.
- **Context**: Provides `ProfileContext` — consumed via `useProfile()` hook.

### `HomePage` / `SearchPage` / `ComparePage` (`discovery.tsx`)

- **HomePage**: Hero section + category grid + nearby shops + price comparison table + map + shopping lists + active order banner.
- **SearchPage**: Full-text search with filters (category, in-stock, open-only, sort). Tab switching between products and shops.
- **ComparePage** (`kind="compare"`): Side-by-side price comparison with unit and brand filters.

### `ProductCard` / `ShopCard` (`product-card.tsx`)

- Displays product image, name, price (INR format), shop name, distance badge.
- "Add to cart" button with cross-shop confirmation dialog.
- Shop card shows rating, product count, status badge, distance.

### `CartPage` / `OrdersPage` / `OrderPage` (`order-pages.tsx`)

- **Cart**: Line items with quantity +/- controls, running total, proceed to checkout.
- **Checkout**: Address selection (from saved addresses) + order placement with idempotency key.
- **Orders**: List view with status badges, filters by status.
- **Order Detail**: Item breakdown, delivery address, tracking timeline, review/complaint actions.

### `AccountPages` (`account-pages.tsx`)

- **AuthPage**: Login form, registration form (with password strength validation), Google OAuth button.
- **ProfilePage**: Edit name, phone, avatar (with image upload).
- **AddressesPage**: CRUD for delivery addresses with location picker integration.

### `ChatPage` (`chat-page.tsx`)

- Room list with unread badge counts.
- Message thread supporting TEXT, PRODUCT, PRODUCT_LIST, ORDER, IMAGE message types.
- Rich message cards for products (with price, stock) and orders (with status).
- Auto-polls every 5 seconds for new messages via `useRealtime`.

### `ManagementPages` (`management-pages.tsx`)

- Generic CRUD table for shops, products, categories, users, reviews, complaints.
- Inline status toggles (approve/reject shops, activate/suspend users).
- `EntityForm` modal for create/edit operations.

### `LocationPicker` (`location-picker.tsx`)

- Three modes: browser geolocation, IP-based geolocation, manual search.
- Google Places autocomplete (when enabled).
- Saved addresses dropdown for logged-in users.

### `GoogleMap` (`google-map.tsx`)

- Full Google Maps integration with `@googlemaps/js-api-loader`.
- Shop markers on the map, click-to-view shop details.
- Delivery radius visualization.

### `Feedback` (`feedback.tsx`)

- **ToastProvider/useToast**: Global toast notification system (success/error, 4.5s auto-dismiss).
- **Loading**: Skeleton grid (3 cards).
- **Empty**: Empty state with icon and message.
- **Failure**: Error state with retry button.

---

## Pages & Routing

The app uses a **catch-all dynamic route** at `src/app/[...segments]/page.tsx` that maps URL segments to components:

| URL | Component | Auth Required |
|---|---|---|
| `/` | `HomePage` | No |
| `/login`, `/register` | `AuthPage` | No |
| `/forgot-password`, `/reset-password` | `AuthPage` (recovery flow incomplete) | Public page |
| `/search` | `SearchPage` | No |
| `/compare` | `SearchPage (compare mode)` | No |
| `/shops` | `SearchPage (shops mode)` | No |
| `/shops/{id}` | `ShopPage` | No |
| `/products/{id}` | `ProductPage` | No |
| `/cart` | `CartPage` | No |
| `/checkout` | `CartPage (checkout mode)` | Customer |
| `/profile` | `ProfilePage` | Any role |
| `/addresses` | `AddressesPage` | Customer |
| `/shopping-lists` | `ShoppingListsPage` | Customer |
| `/orders` | `OrdersPage` | Any role |
| `/orders/{id}` | `OrderPage` | Any role |
| `/chat` | `ChatPage` | Customer |
| `/reviews` | `ManagementPage (reviews)` | Customer |
| `/complaints` | `ComplaintsPage` | Customer |
| `/shopkeeper` | `DashboardPage` | Shopkeeper |
| `/shopkeeper/shop` | `ManagementPage (shops)` | Shopkeeper |
| `/shopkeeper/products` | `ManagementPage (products)` | Shopkeeper |
| `/shopkeeper/inventory` | `ManagementPage (inventory)` | Shopkeeper |
| `/shopkeeper/orders` | `OrdersPage` | Shopkeeper |
| `/shopkeeper/chat` | `ChatPage` | Shopkeeper |
| `/shopkeeper/reviews` | `ManagementPage (reviews)` | Shopkeeper |
| `/shopkeeper/settings` | `ProfilePage` | Shopkeeper |
| `/admin` | `DashboardPage` | Admin |
| `/admin/users` | `ManagementPage (users)` | Admin |
| `/admin/shops` | `ManagementPage (shops)` | Admin |
| `/admin/categories` | `ManagementPage (categories)` | Admin |
| `/admin/products` | `ManagementPage (products)` | Admin |
| `/admin/orders` | `OrdersPage` | Admin |
| `/admin/reviews` | `ManagementPage (reviews)` | Admin |
| `/admin/complaints` | `ManagementPage (complaints)` | Admin |
| `/admin/reports` | `ReportsPage` | Admin |
| `/admin/settings` | `PlatformSettingsPage` | Admin |

---

## Key Business Logic

### Shop Discovery (`discoverShops`)

1. Queries shops with `approval_status: "APPROVED"` and `status ≠ "INACTIVE"`.
2. Filters by latitude/longitude bounding box (±50km / 111°).
3. Filters by active owner (user status = "ACTIVE").
4. Applies category filter with hierarchy traversal (`categoryContains`).
5. Computes Haversine distance; excludes shops beyond their `delivery_radius_km`.
6. Calculates average rating from reviews.
7. Counts active products per shop.
8. Sorts by distance/rating/name and paginates (24 per page).

### Product Discovery (`discoverProducts`)

1. Finds all eligible shops (same filtering as above).
2. Queries products in those shops with `is_active: true`.
3. Applies text search, in-stock filter, unit/brand filters.
4. Category filter with hierarchy.
5. Enriches with shop info (name, status, distance, rating).
6. Sorts by price/distance/rating/name; paginates.

### Order Placement

1. Validates all inputs with `orderSchema`.
2. **Idempotency**: Checks `request_key` — if order already exists, returns existing ID.
3. Verifies shop is approved, visible, and OPEN.
4. Validates delivery address belongs to user and is within shop's delivery radius.
5. Verifies each product: belongs to shop, is active, has sufficient stock, price hasn't changed.
6. Creates `Order`, `OrderItem` records and initial `OrderTracking` entry.
7. Decrements each product with a separate `$inc` write. The order and inventory updates are not one transaction and do not condition the write on remaining stock.
8. Returns order ID.

### Order Status Transitions
```
PLACED → ACCEPTED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
  ↓         ↓           ↓
CANCELLED CANCELLED  CANCELLED (only by shopkeeper/admin)
```

- Customers can cancel only `PLACED` or `ACCEPTED` orders.
- Shopkeepers/admins follow the state machine.
- On cancellation, stock is automatically restored.

### Shopping List Resolution (`lists/{id}/resolve`)

Matches list items to in-stock products at a specific shop:

1. For each list item, searches available products by name, unit, and product_id.
2. Returns `{ products: [...], missing: [...] }` — found products go to cart, missing items are reported.

### Chat System

- Customer opens chat with a shop → creates/finds `ChatRoom`.
- Messages support rich types: TEXT, PRODUCT (auto-fetches product details), PRODUCT_LIST (snapshot of shopping list), ORDER (order reference), IMAGE (uploaded image path).
- Both parties can mark messages as read.
- 5-second polling on the client side refreshes message count and content.

### Distance Calculation

The Haversine formula (`distanceKm`) computes great-circle distance between two lat/lng coordinates, used for:

- Filtering shops within delivery radius
- Sorting by proximity
- Validating delivery address is reachable

---

## Google Maps & Location Services

### IP Geolocation (`/api/locate`)

Cascading fallback strategy:

1. **ipwho.is** — primary
2. **freeipapi.com** — fallback
3. **ip-api.com** — secondary fallback
4. **Hardcoded Gwalior** — default for local/MP IPs

### Places Proxy (`/api/places`)

Server-side proxy using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, which is also exposed to the browser:

- **Autocomplete**: `?input=query` → Google Place Autocomplete
- **Place Details**: `?placeId=xxx` → lat/lng + formatted address
- **Geocode**: `?geocode=query` → cascading: Google Geocoding → Find Place → Nominatim (OpenStreetMap)

### Google Map Component

- Uses `@googlemaps/js-api-loader` for dynamic loading.
- Shows shop markers on the map.
- Supports delivery radius circles.
- Integrates with the location picker for address selection.

---

## File Upload Pipeline

`POST /api/upload` handles image uploads:

1. **Size limit**: 4 MB max (streamed with `limitedBody`).
2. **Format validation**: Magic bytes check for JPEG, PNG, WebP.
3. **MIME verification**: File type must match magic bytes.
4. **Image integrity**: `sharp` verifies the image is not corrupted (25M pixel limit).
5. **Storage**: Saves to `public/uploads/{bucket}/{userId}/{uuid}.{ext}`.
6. **Buckets**: `avatars`, `shop-images`, `product-images`, `chat-images`, `category-images`.
7. **Access control**: Category images require admin; shop/product images require shopkeeper.

---

## Validation Layer (Zod)

All input validation uses Zod schemas defined in `src/lib/validation.ts`:

| Schema | Used For |
|---|---|
| `registerSchema` | User registration (name, email, password with strength rules, phone, role) |
| `addressSchema` | Address CRUD (label, coordinates, city, state, pincode) |
| `shopSchema` | Shop CRUD (name, description, coordinates, hours, radius, status) |
| `productSchema` | Product CRUD (name, description, brand, unit, price, stock) |
| `orderSchema` | Order placement (shop_id, address_id, items with expected prices, idempotency key) |
| `messageSchema` | Chat messages (room_id, type, message, reference_id) |
| `listItemSchema` | Shopping list items (name, quantity, unit, product_id) |
| `categorySchema` | Category CRUD (name, description, parent_id) |
| `platformSettingsSchema` | Platform settings (marketplace_name, support_email, announcement) |
| `reviewSchema` | Review submission (order_id, shop_id, rating 1–5, comment) |
| `complaintSchema` | Complaint filing (subject, description, optional order/shop) |
| `productImageSchema` | Product image records |
| `profileSchema` | Profile updates (name, phone, avatar_url) |
| `searchSchema` | Search/discovery queries (coordinates, query, filters, sorting, pagination) |

**Password rules**: Min 10 chars, max 128, must include lowercase, uppercase, and number.

---

## Custom Hooks

### `useQuery<T>(path)` — `src/hooks/use-query.ts`

Generic data-fetching hook:

- Returns `{ data, error, loading, refresh }`.
- Calls `api<T>(path)` (GET) on mount and when path/revision changes.
- Suppresses stale state updates after cleanup; it does not abort the underlying fetch.
- `refresh()` triggers re-fetch by incrementing revision counter.
- Pass `null` as path to skip fetching.

### `useDebounce<T>(value, delay)` — `src/hooks/use-query.ts`

Debounces a value by `delay` ms (default 300). Used for search input throttling.

### `useRealtime(table, onChange, filter?)` — `src/hooks/use-realtime.ts`

Polling-based refresh hook:

- Calls `onChange()` every 5 seconds.
- Uses `useRef` to always call the latest callback.
- Named `table` parameter is for future WebSocket compatibility but currently only drives the `useEffect` dependency.

---

## Database Seed Script

`database/scripts/seed-mongo.ts` creates comprehensive demo data:

- **8 categories**: Grocery, Dairy, Bakery, Stationery, Flowers, Household, Personal care, Snacks (with hierarchy).
- **10 shops**: 5 in Gwalior, 5 in Bengaluru (with varied statuses: open, closed, pending approval).
- **60 products**: 6 products per shop (Tata Salt, Milk, Bread, Sugar, Atta, Notebook) with varied prices.
- **5 shopkeepers**, **2 customers**, **1 admin** — all with the same password from `SEED_PASSWORD`.
- **Addresses**, **shopping lists**, **chat rooms**, **messages**, **orders**, **reviews**, **complaints** — all pre-populated for testing.

**Run**: `npm run seed` (requires `MONGODB_URI` and `SEED_PASSWORD` in `.env.local`).

Deterministic demo IDs use SHA-256 hashes. The script upserts demo records and may overwrite their data; use a development database.

---

## Testing

### Unit Tests (Node test runner + tsx)
```powershell
npm test
```

- `brand.test.ts` — Brand name display logic
- `database.test.ts` — DB connection and model tests
- `service-errors.test.ts` — Error classification
- `validation.test.ts` — Zod schema validation

### Browser Tests (Playwright)
```powershell
npm run test:browser       # Smoke tests
npm run test:integration   # Marketplace flows
npm run test:demo          # Full demo workflow
npm run test:security      # Security scenarios
```

Playwright config:

- Runs against `http://localhost:3100` (starts the production server; run `npm run build` first).
- Desktop Chrome + Pixel 7 (mobile) projects.
- Uses local Chrome installation if available.

---

## Security

### HTTP Security Headers (`next.config.ts`)

Applied to all routes:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(self), camera=(), microphone=()`
- `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'`
- `X-Powered-By` header is removed.

### API Security

- **CSRF Protection**: Mutations verify `Origin` header and `sec-fetch-site` to block cross-site requests.
- **Request size limits**: JSON body capped at 100KB, file uploads at 4.25MB.
- **Image validation**: Magic bytes + MIME type + sharp integrity check.
- **Input validation**: Zod validates structured request bodies; validation does not replace authorization or safe query construction.
- **Password hashing**: bcrypt with 12 salt rounds.
- **JWT cookies**: httpOnly, secure (in production), sameSite=lax.
- **Role enforcement**: Protected APIs use active-user and optional role checks; ownership coverage has known gaps documented below.
- **Order retries**: Existing customer/request keys return the prior ID, backed by a unique compound index; this is not transactional stock protection.
- **Soft-delete**: Products are deactivated, not deleted, preserving order history.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Secret for JWT signing (use a long random string in production) |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Public URL (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional | Google Maps JavaScript API key |
| `NEXT_PUBLIC_GOOGLE_PLACES_ENABLED` | Optional | Enable Places autocomplete (`true`/`false`) |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `SEED_PASSWORD` | For seeding | Password for demo accounts (min 10 chars) |
| `PLAYWRIGHT_EXECUTABLE_PATH` | For testing | Custom browser path for Playwright |
| `DEFAULT_CITY` | Optional | `Gwalior` enables the hardcoded override; not an arbitrary city setting |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Fallback OAuth client ID |

---

## Setup & Installation

### Prerequisites

- **Node.js 22+**
- **npm**
- **MongoDB** (local or remote instance)
- **Google Maps API key** (optional, for maps features)
- **Google OAuth credentials** (optional, for Google sign-in)

### Steps

```powershell
# 1. Clone the repository
git clone https://github.com/Xabhi0811/Kirana.git
cd kirana

# 2. Install dependencies
npm install

# 3. Create .env.local from the template
cp .env.example .env.local
# Edit .env.local with your MongoDB URI, JWT secret, and optional API keys

# 4. (Optional) Seed demo data
npm run seed

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running the App

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js dev server with hot-reload |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run seed` | Populate MongoDB with demo data |

---

## Quality Checks

```powershell
npm run lint           # ESLint
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm test               # Unit tests (Node test runner)
npm run test:browser   # Playwright smoke tests
npm run test:demo      # Full E2E demo tests
npm run test:security  # Security scenarios
npm run format         # Prettier formatting
```

---

## Demo Accounts

New seeded accounts use `SEED_PASSWORD`. Existing account passwords are retained on reseed. The following accounts are available:

| Role | Email |
|---|---|
| Admin | `admin@localkart.test` |
| Shopkeeper 1 | `shopkeeper1@localkart.test` |
| Shopkeeper 2 | `shopkeeper2@localkart.test` |
| Customer 1 | `aarav@localkart.test` |
| Customer 2 | `isha@localkart.test` |

---

## License

Private project; no open-source license file is present.

## Runtime Scope and Historical Files

The current application is a Next.js monolith: server pages and route handlers share the same repository and MongoDB models. The root layout reads the session profile, renders `Shell`, and passes page content into it. Client screens call the API; the API validates input, checks access where implemented, queries Mongoose models and returns JSON. `src/proxy.ts` only passes requests through.

The database module caches both a connection and its promise globally. Model creation reuses existing Mongoose models during hot reload. API helpers convert top-level `_id` fields into frontend `id` fields; related records are assembled explicitly. There is no browser cart collection: the cart is localStorage state, and checkout revalidates its values on the server.

| Path | Status and purpose |
| --- | --- |
| `database/scripts/seed-mongo.ts` | Active MongoDB seeding workflow |
| `database/supabase/migrations/` | Historical PostgreSQL schema and feature migrations |
| `database/supabase/tests/integrity.sql` | Historical SQL integrity checks; not run by `npm test` |
| `database/supabase/config.toml`, `local-postgres-bootstrap.sql` | Retained local Supabase/PostgreSQL setup |
| `database/evidence/audit-evidence.json` | Stored evidence artifact, not current test results |
| `supabase/certs/prod-ca-2021.crt` | Retained PostgreSQL certificate |
| `archive/prototype/` | Earlier standalone HTML/CSS/JavaScript prototype |
| `AGENTS.md`, `CLAUDE.md` | Repository instructions for coding tools |

Supabase RLS, SQL foreign keys, triggers and functions do not run in the active Mongoose application. No Supabase migration command is required for current local setup. There is no separate payment gateway, payment ledger, queue, driver application or live GPS service. Order tracking is a timeline of status changes.

### Data relationships and integrity

- A user may own multiple addresses, shops and lists. A shop belongs to an owner and category; its optional address reference is separate from its inline address/coordinates.
- Products belong to shops/categories. Order items retain product references and purchased name/price snapshots; an order retains an address snapshot even if a saved address changes later.
- Reviews belong to a specific delivered order and are unique per order. Complaints can omit their order/shop references.
- Chat rooms have a unique customer/shop pair. Messages belong to a room and sender; their rich payloads are stored snapshots, not additional database-enforced relationships.
- Audit `resource_id` is polymorphic and interpreted with `resource`. `PlatformSettings` is intended as a singleton but has no unique singleton key.
- The shop coordinate index is a normal compound index, not a `2dsphere` index. Discovery performs Haversine calculations in application code.

Most mutable models have `created_at` and `updated_at`. Product images, messages, tracking and audit logs use explicit creation timestamps; order items have no automatic timestamps. The user/list-item save hooks fill missing alias fields; they do not guarantee that every update operation keeps aliases synchronized.

### Routing and UI boundaries

The page router awaits `params` and `searchParams`, forces dynamic rendering and rejects extra segments. `/account`, `/products` without an ID, and `/admin/audit-logs` are not implemented pages. Audit logs are available through `/api/manage/audit_logs`. Protected-page redirects use `/login` for missing sessions and `/` for wrong-role/inactive profiles.

Page roles do not imply identical API permissions: some marketplace APIs only require an active session. Canonical uppercase roles are the reliable values for page guards. Shopkeepers can browse public discovery, but customer-only pages such as checkout and shopping lists remain customer-gated.

Search pages accept `q` and `category`; comparison also accepts `unit` and `brand`. Chat accepts a `room` query parameter. Complaint shop preselection exists but still validates UUIDs even though active database IDs are ObjectIds.

### Business-rule details

Stored opening/closing times do not automatically change shop status. Checkout checks explicit `OPEN` status. Price comparison uses product search and unit/brand filters; there is no canonical cross-shop SKU table establishing equivalence between differently named products.

List resolution is limited to 100 items, combines repeated product matches, enforces stock/quantity limits, and reports missing items. It prepares a cart without reserving stock. A resolved cart still passes normal order validation at checkout.

Shopkeeper metrics include stock below five, unread messages, today's orders and average rating. Admin reports accept 1–90 days, default 30, grouping by order creation date and current status. Delivered value is not a payment ledger or a measure of delivery-day revenue. The current “Open complaints” metric counts every status other than uppercase `RESOLVED`, including `CLOSED`. Audit logs cover selected mutations, not every CRUD operation.

## API Contract and Request Examples

The API tables list supported intended paths. The catch-all handler is not a strict route manifest: some branches ignore additional segments within its three-segment limit. Location and OAuth endpoints have their own route files.

Responses are plain JSON objects or arrays. Errors normally use `{ "error": "message" }`. Common statuses are 400 for invalid input, 401 for missing authentication, 403 for explicit access denial, 404 for missing records, 405 for unsupported methods, 409 for duplicate conflicts and 503 for unexpected service failures. Some invalid state transitions return the default 400 rather than 403.

Most updates use **POST**. PATCH is accepted only for platform settings. DELETE is supported for addresses, lists, list items, reviews and management products/categories at their ID paths. Product deletion marks `is_active=false`.

Pagination normally uses zero-based `page` and 24 records; chat messages use 50, room summaries cap at 100, and public categories return up to 100 using a `page * 24` offset. Consult each branch before assuming uniform pagination.

### Discovery

```text
GET /api/search/products?lat=26.2124&lng=78.1772&q=milk&in_stock=true&open_only=true&sort_by=price&page=0
```

Supported filters include `q`, `category`, `in_stock`, `open_only`, `sort_by`, `page`, `shop`, `unit` and `brand`. Shops use the applicable subset. Search requires `lat` and `lng`; shop/product detail calls also use location coordinates. IDs are MongoDB ObjectId strings, although several Zod schemas only enforce nonempty string length rather than ObjectId syntax.

### Place an order

```json
{
  "shop_id": "<shop ObjectId>",
  "address_id": "<owned address ObjectId>",
  "request_id": "<unique submission key>",
  "notes": "Please call on arrival",
  "items": [
    { "product_id": "<product ObjectId>", "quantity": 2, "expected_price": 45 }
  ]
}
```

Send this to `POST /api/orders` with the session cookie. The server calculates the total from database prices, not a client-submitted total. It permits 1–100 distinct products and quantities 1–999. Success returns `{ "id": "..." }` with 201, including the existing-request fast path. Reuse the same request key when retrying the same submission.

```mermaid
sequenceDiagram
    participant C as Customer UI
    participant A as Orders API
    participant D as MongoDB
    C->>A: Submit request key, address and expected prices
    A->>D: Find customer/request key
    alt Existing order
        A-->>C: Existing order ID
    else New submission
        A->>D: Read shop, owned address and products
        A->>A: Validate radius, stock, ownership of address and prices
        A->>D: Create order with address snapshot
        loop Each product
            A->>D: Create order-item snapshot
            A->>D: Decrement stock
        end
        A->>D: Create PLACED tracking event
        A-->>C: New order ID
    end
```

These are separate writes without a transaction. The request key is not a guarantee against partial writes or concurrent overselling. Cancellation also restores stock and saves status in separate operations.

### Other mutation shapes

| Action | Body fields |
| --- | --- |
| Order status | `status`, `note` |
| Resolve list | `shop_id`, `latitude`, `longitude` |
| Create list item | `list_id`, nullable `product_id`, `name`, `quantity`, `unit` |
| Open chat | `shop_id` |
| Send message | `room_id`, `message_type`, `message`, optional `reference_id` or `image_path` |
| Review | `order_id`, `shop_id`, `rating`, `comment` |
| Complaint | `subject`, `description`, optional `order_id`, `shop_id`, `status` |
| Upload | Multipart `file` and `bucket` |

The browser `api()` wrapper chooses GET whenever its body argument is undefined. DELETE calls therefore pass a body such as `{}` and the explicit method. Uploads use multipart handling separately.

## Known Implementation Gaps

These are observations from the source, not fixes made by this documentation update. They qualify the feature descriptions and diagrams above.

| Area | Current behavior / gap |
| --- | --- |
| Public registration | `registerSchema` accepts `ADMIN` and legacy role aliases; the handler persists the submitted role. Privileged registration is not blocked server-side. |
| Ownership checks | Shop/product management writes check role but do not consistently constrain targets to the caller's shops. List-item mutations lack parent-list ownership checks; list deletion removes items before checking list ownership. |
| Inventory and orders | Placement, stock deduction, cancellation and tracking use separate writes without transactions or conditional stock reservation. Concurrency can cause overselling, duplicate stock restoration or incomplete records. |
| OAuth | Initiation/callback have no state/PKCE checks. Email linking does not explicitly check Google's verified-email flag. |
| Password recovery | Forgot-password UI has no implemented recovery email/token endpoint. Reset-password is a signed-in password change, not a token-based recovery flow. |
| Session lifecycle | JWTs last seven days with no revocation/refresh store. Password changes do not revoke existing sessions. A development secret is used when `JWT_SECRET` is absent. |
| Reference integrity | Mongoose refs do not enforce foreign keys/cascades. Category deletion can leave references behind; complaint creation does not fully validate ownership of linked records. |
| Database indexes | Phone/Google-ID indexes declare both `sparse` and `partialFilterExpression`; verify/correct actual MongoDB index creation. Inspecting schema metadata does not prove indexes initialize successfully. |
| Legacy values | Some schemas accept lowercase role/status values while guards and filters compare uppercase. This can cause access or visibility inconsistencies. |
| Unique conventions | Default addresses, primary product images and settings singleton lack dedicated unique constraints. |
| Abuse/scaling | No application rate limiter. Search uses regular expressions; discovery enriches/filter results in application code. Polling and repeated related-record queries increase database load. |
| Upload privacy | Files under `public/uploads` are publicly accessible, including chat images. There is no file garbage collection or object-storage integration. |
| Test drift | Some browser expectations reference unsupported routes or historical behavior. Test-file existence is not evidence that those features currently pass. |

## Deployment and Troubleshooting

### Configuration details

The example file omits Google OAuth variables; add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if using Google login. Its callback URI is `<NEXT_PUBLIC_SITE_URL>/auth/callback` and must match the OAuth application configuration. Keep the client secret private. The Maps key is browser-visible and is also used for server REST requests; browser-referrer restrictions can block those calls, and the application has no separate server-key variable.

The Places handler requires a configured key before reaching its Nominatim fallback. IP location tries three services with four-second timeouts, overrides local/Madhya Pradesh/Indore results to Gwalior, and falls back there if all providers fail. `DEFAULT_CITY` only recognizes `Gwalior` for this override.

Seeding uses deterministic IDs and upserts demo data; it is not a read-only operation. Existing user passwords remain unchanged. Demo customer addresses are in Bengaluru while automatic location may be Gwalior, so select a compatible shop/address when testing checkout. Shopkeepers 3–5 are also available as `shopkeeper3@localkart.test` through `shopkeeper5@localkart.test`.

### Build and hosting

```powershell
npm run build
npm run start
```

The backend needs a Node runtime, MongoDB connectivity and writable persistent upload storage. It uses filesystem APIs and `sharp`, so it is not a static export. Multiple application instances need shared image storage or an object-storage adaptation. Do not assume runtime writes to `public/` persist or are served identically on every managed host. Back up MongoDB and uploaded files together. Verify indexes on the actual database and resolve the authorization/concurrency gaps before production deployment.

### Test setup and maintenance

Playwright loads `.env.local`, uses one worker and starts `npm run start -- --port 3100`. Build first. It can reuse an existing server outside CI. Set `PLAYWRIGHT_EXECUTABLE_PATH`, use the detected Windows Chrome installation, or install Chromium using `npx playwright install chromium`.

`npx playwright test` runs all browser files, including branding; individual package scripts target subsets. Browser workflows may mutate data, so use a disposable development database. Unit tests inspect model/schema behavior rather than proving live database connectivity or complete authorization coverage. No application/browser pass is implied by this README.

Before modifying Next.js code, follow `AGENTS.md` and read the relevant guide under `node_modules/next/dist/docs/`. Trace feature changes through the page router, component, API branch, Zod schema and Mongoose model together. `npm run format` rewrites files; it is not a read-only formatting check.

| Symptom | Check |
| --- | --- |
| Missing URI / unavailable service | `.env.local`, MongoDB availability; URI is read when the DB module loads |
| Empty discovery | Location, radius, approval, owner status, shop status and active products |
| Checkout outside radius | Saved checkout address, which can differ from browsing location |
| Price changed / insufficient stock | Refresh cart/product data; server uses current values |
| Google login fails | OAuth ID/secret, site origin and callback registration |
| Places lookup fails | Key/API configuration and restrictions for server REST usage |
| Seed password rejected | Reseeding does not reset existing account passwords |
| Unexpected account visibility | Uppercase role/status and ownership checks |
| Upload disappears after deploy | Persistent/shared storage and host file-serving behavior |
| Browser tests cannot start | Production build, port 3100, browser executable and environment |

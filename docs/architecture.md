# Architecture

> System design, component map, data flow, and key engineering decisions.

---

## Table of Contents

- [Overview](#overview)
- [Component Map](#component-map)
- [Data Flow](#data-flow)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Caching Strategy](#caching-strategy)
- [Authentication & Authorisation](#authentication--authorisation)
- [Rate Limiting](#rate-limiting)
- [File Processing Pipeline](#file-processing-pipeline)
- [Notification System](#notification-system)
- [Key Design Decisions](#key-design-decisions)

---

## Overview

KinMarché is a standard **three-tier web application**:

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  React 18 SPA (Vite)                                          │
│  Code-split by user role (admin-pages / store-pages / vendor) │
└──────────────────────┬───────────────────────────────────────┘
                       │  HTTP/JSON  (proxied in dev, direct in prod)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Express API Server  (Node.js 18+)                           │
│  Helmet · CORS · Rate Limit · JWT · Multer · ExcelJS         │
└──────────────────────┬───────────────────────────────────────┘
                       │  Prisma ORM (parameterised queries)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL 15+                                              │
│  Supabase / Neon / Railway / local                           │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Map

```
KinGuard/
│
├── client/src/
│   ├── api/
│   │   ├── client.js          Axios instance — base URL, Bearer token injection,
│   │   │                      401 interceptor (clear token → redirect to /login)
│   │   ├── auth.js            login(), getCurrentUser()
│   │   ├── admin.js           All admin API calls + cache invalidation
│   │   ├── store.js           All store manager API calls
│   │   └── cache.js           In-memory TTL Map (client-side, clears on logout)
│   │
│   ├── context/
│   │   ├── AuthContext.jsx    JWT stored in localStorage, background re-validation
│   │   │                      on mount, login() → navigate to role dashboard
│   │   └── ToastContext.jsx   Global toast notifications (success/error/warning/info)
│   │
│   ├── components/
│   │   ├── AdminLayout.jsx    Red gradient top navbar, hamburger mobile menu,
│   │   │                      notification bell for admins
│   │   ├── StoreLayout.jsx    White navbar with red accent, bottom mobile nav,
│   │   │                      notification bell for store managers
│   │   └── NotificationBell.jsx  Polls /api/{role}/notifications every 60 s,
│   │                             shows badge count + dropdown, navigates on click
│   │
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── Dashboard.jsx  Network overview — KPI cards, risk scorecard, hotspots
│   │   │   ├── Upload.jsx     3-step upload flow (pick → validate preview → confirm)
│   │   │   ├── Batches.jsx    Cycle management — deadlines, extensions, unlocks
│   │   │   ├── Inventory.jsx  Paginated cross-store view with admin overrides
│   │   │   ├── Analytics.jsx  Multi-cycle shortage rate trend chart (SVG sparklines)
│   │   │   ├── Reports.jsx    Reconciliation report with Excel/PDF export
│   │   │   ├── Stores.jsx     Store CRUD + bulk delete
│   │   │   ├── Users.jsx      User CRUD with password strength indicator
│   │   │   └── AuditLogs.jsx  Immutable action log with export
│   │   └── store/
│   │       ├── Dashboard.jsx  Stock count progress, past-date batch alerts
│   │       └── Inventory.jsx  Inline count entry with debounced auto-save (700 ms),
│   │                          instant variance calculation, batch selector
│   │
│   └── styles/
│       ├── tokens.css         CSS custom properties, @keyframe animations
│       ├── reset.css          Browser reset, body background (retail texture)
│       ├── layout.css         Admin navbar (hl-*), store navbar, responsive breakpoints
│       ├── components.css     Cards, KPI cards, tables, badges, buttons, forms,
│       │                      modals, alerts, notification bell
│       ├── inventory.css      Inventory table, progress bar, qty inputs, save states
│       ├── pages.css          Login, Home, 404 page styles
│       └── toast.css          Toast notification system
│
└── server/src/
    ├── app.js                 Express setup: Helmet, CORS, compression,
    │                          JSON body limit (1 MB), rate limiters, route mounting
    ├── server.js              DB connect with retry, process.listen
    │
    ├── config/
    │   ├── env.js             Validates all required env vars on startup (exits if missing)
    │   └── prisma.js          PrismaClient singleton — prevents connection pool exhaustion
    │
    ├── middleware/
    │   ├── auth.js            authenticate() — JWT verify + DB user lookup
    │   │                      requireRole() — flexible role guard
    │   │                      requireStoreManager() — enforces storeId assignment
    │   └── errorHandler.js    Converts AppError to JSON; stack trace in dev only
    │
    ├── controllers/
    │   ├── authController.js  login (DB retry on cold-start), getCurrentUser
    │   ├── adminController.js ~2100 lines covering all admin operations
    │   └── storeController.js Dashboard, batches, inventory CRUD, submit, download,
    │                          notifications
    │
    ├── routes/
    │   ├── authRoutes.js      POST /login, GET /me
    │   ├── adminRoutes.js     All /admin/* with ADMIN role guard + rate limiter
    │   └── storeRoutes.js     All /store/* with STORE_MANAGER role guard + rate limiter
    │
    └── services/
        ├── auditService.js    createAuditLog() — fire-and-forget, never throws
        ├── serverCache.js     sGet/sSet/sInvalidate — in-memory TTL Map (server-side)
        ├── emailService.js    sendNewCycleEmail, sendSubmissionEmail via Nodemailer
        └── pdfService.js      PDF exports using pdfmake
```

---

## Data Flow

### Upload Flow

```
Admin selects file
       │
       ▼
POST /admin/uploads/preview
       │  parseFileToRows() — ExcelJS or csv-parse
       │  Validate each row (store code, material code, qty)
       │  Return preview array (valid / warning / error)
       ▼
Admin reviews preview
       │
       ▼
POST /admin/uploads  (or ?force=true for duplicate-date override)
       │  1. Duplicate-date window check (±3 days)
       │  2. Auto-create any new store codes found in the file
       │  3. createMany() InventoryRecords with skipDuplicates
       │  4. Update batch status to COMPLETED
       │  5. Invalidate server cache for admin:dashboard
       │  6. Fire-and-forget: email affected store managers
       ▼
Store Managers see new items in their Stock Count page
```

### Count & Submit Flow

```
Store Manager opens Stock Count
       │  GET /store/inventory?batchId=X
       ▼
Manager types a count value
       │  onChange → updateField() → debounceTimers[id] = setTimeout(saveRecord, 700ms)
       │  Variance = Counted − Book Stock calculated instantly client-side
       ▼
700 ms of no typing → PATCH /store/inventory/:id
       │  Server re-validates ownership (storeId match)
       │  Re-calculates Variance server-side
       │  Stores: physicalQuantity, difference, remarks, shrinkageCategory
       ▼
Manager clicks Submit Count
       │  Client-side pre-validation (all counts filled, discrepant items have category+detail)
       │  POST /store/inventory/submit
       │     Prisma $transaction:
       │       1. Re-validate all pending records
       │       2. updateMany() → status = SUBMITTED
       │     Fire-and-forget:
       │       3. detectRepeatDiscrepancies()
       │       4. Email all active admins
       ▼
Admin notification bell shows "N stores submitted in last 24h"
```

---

## Frontend Architecture

### Code Splitting

Vite is configured with `manualChunks` to produce three JavaScript bundles:

| Bundle | Contents | Loaded by |
|--------|----------|-----------|
| `vendor` | React, React Router, Axios | All pages |
| `admin-pages` | All 9 admin page components | Admin users only |
| `store-pages` | 2 store page components | Store managers only |

This means store managers never download admin code, and vice versa.

### Client-Side Cache

`api/cache.js` is a simple `Map`-based TTL cache that lives for the browser tab session:

- Dashboard: 30 s TTL
- Stores list: 60 s TTL
- Batches: 30 s TTL
- Users: 60 s TTL
- Trends: 120 s TTL
- Inventory, reports: **no cache** (always fresh)

The cache is fully cleared on logout to prevent cross-user data leaks.

### Auth Flow

```
Page load
  │  Read localStorage → kg_user (instant, no async wait)
  │  Background: GET /auth/me (validates token is still valid on the server)
  ▼
PrivateRoute checks user + role
  │  Not logged in → redirect /login
  │  Wrong role → redirect /
  ▼
401 response on any API call
  │  Axios interceptor in client.js
  │  Clears localStorage token + kg_user
  │  Redirects to /login
```

---

## Backend Architecture

### Request Lifecycle

```
HTTP request
  │
  ├── Helmet (security headers)
  ├── CORS (origin whitelist from CLIENT_URL)
  ├── compression (gzip)
  ├── express.json (1 MB body cap)
  ├── Rate limiter (authLimiter or apiLimiter)
  │
  ├── Route match
  │   ├── authenticate() — verify JWT, DB lookup, attach req.user
  │   ├── requireRole('ADMIN') or requireStoreManager()
  │   └── Controller function
  │       └── AppError thrown → errorHandler middleware
  │
  └── Response
```

### Error Handling

All controllers use `try/catch → next(error)`. The `errorHandler` middleware:

1. If `error.statusCode` is set → use it (AppError)
2. Prisma `P2025` (record not found) → 404
3. Prisma `P2002` (unique constraint) → 409
4. Anything else → 500

Stack traces are only included in `development` mode.

---

## Caching Strategy

Two independent caches prevent redundant heavy DB queries:

### Server Cache (`serverCache.js`)

In-memory `Map` keyed by string. Sits in the Node.js process.

| Cache Key | TTL | Invalidated by |
|-----------|-----|----------------|
| `admin:dashboard` | 30 s | upload, store changes, batch changes |

Used only for the admin dashboard aggregation query (the most expensive: 4 parallel raw SQL queries).

### Client Cache (`api/cache.js`)

In-memory `Map` keyed by string. Lives in the browser tab.

| Cache Key | TTL |
|-----------|-----|
| `admin:dashboard` | 30 s |
| `admin:stores` | 60 s |
| `admin:users` | 60 s |
| `admin:batches` | 30 s |
| `admin:trends:{N}` | 120 s |
| `store:dashboard` | 30 s |

Cleared entirely on logout.

---

## Authentication & Authorisation

### JWT Structure

```json
{
  "userId": 1,
  "role": "ADMIN",
  "storeId": null,
  "iat": 1720000000,
  "exp": 1720028800
}
```

The token is verified on every request. If the token is valid but the user has been deactivated in the database, the request is rejected with 401.

### Role Guard Model

```
/api/auth/*      →  No auth required
/api/admin/*     →  authenticate() + requireRole('ADMIN')
/api/store/*     →  authenticate() + requireStoreManager()
                    (checks role = STORE_MANAGER AND storeId IS NOT NULL)
```

### Store Isolation

Every store controller query includes `storeId: req.user.storeId` in the Prisma `where` clause. There is no way for a store manager to access another store's data, even by manipulating request parameters — the server ignores any `storeId` sent by the client and uses the value from the validated JWT instead.

---

## Rate Limiting

Applied via `express-rate-limit` at the route-mount level in `app.js`:

| Limiter | Routes | Limit | Window |
|---------|--------|-------|--------|
| `authLimiter` | `/api/auth/*` | 10 requests | 15 minutes |
| `apiLimiter` | `/api/admin/*`, `/api/store/*` | 300 requests | 1 minute |

Rate limiting is **disabled in development** (`NODE_ENV=development`) to avoid friction during local iteration. Enable it in staging and production by setting `NODE_ENV=production`.

---

## File Processing Pipeline

```
Multer middleware
  │  Stores file in memory (Buffer) — never touches disk
  │  MIME type whitelist: .xlsx, .xls, .csv
  │  10 MB cap enforced before any parsing
  ▼
parseFileToRows(file)
  │  CSV → csv-parse (columns:true, trim:true)
  │  Excel → ExcelJS
  │     Map column headers via COLUMN_MAP aliases (handles rich-text, merged cells)
  │     cellText() flattens RichText, Hyperlink, Number, Boolean to plain string
  ▼
Row validation loop
  │  findColumn() — tries all known column name aliases in order
  │  Missing storeCode → error
  │  Missing materialCode → error
  │  Missing systemQty → warning (defaults to 0)
  │  Unknown storeCode → warning (store auto-created on upload)
  ▼
Preview (dry run) or Commit
  │  Preview: returns colour-coded row array, no DB writes
  │  Commit: prisma.inventoryRecord.createMany({ skipDuplicates: true })
```

---

## Notification System

Notifications are computed on demand from existing data — no extra database table required.

### Store Manager Notifications (`GET /store/notifications`)

Queries all `UploadBatch` records where this store has `PENDING` inventory records. For each batch:

- **Past deadline** → `type: overdue`, urgent
- **Deadline within 48 h** → `type: deadline`, urgent if ≤12 h
- **No deadline or far deadline** → `type: pending`

### Admin Notifications (`GET /admin/notifications`)

Queries the most recent `COMPLETED` batch and:

- Stores that submitted in the last 24 h → `type: submitted`
- Pending stores + deadline overdue → `type: overdue`, urgent
- Pending stores + deadline approaching → `type: deadline`, urgent if ≤12 h

### Client Polling

`NotificationBell.jsx` polls these endpoints every **60 seconds** using a `setInterval` that is cleared on unmount. The bell shows a red badge with the count; urgent items trigger a CSS pulse animation.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Server-side diff calculation** | Variance = Counted − Book Stock is always computed by the server, never trusted from the client. Prevents manipulation. |
| **skipDuplicates on createMany** | A (batch, store, material) triple is unique. Re-uploading the same file is idempotent — no duplicate rows. |
| **No WebSocket** | Notifications poll every 60 s. The data changes slowly (submissions happen once per cycle). Polling is simpler, cheaper, and sufficient. |
| **`$queryRaw` for aggregations** | Dashboard and batch stats use raw SQL `COUNT(CASE WHEN ...)` for a single-query aggregation. Prisma's ORM aggregation would require N+1 queries. |
| **No React state library** | Context API covers auth; everything else is local state. The app has two isolated user roles — global state would add complexity with no benefit. |
| **CSS custom properties (no framework)** | Full control over the brand colour system (red + white). Tailwind or MUI would fight the design. 7 split CSS files keep concerns organised without a preprocessor. |
| **Monorepo (npm workspaces)** | Single `npm run install:all` sets up everything. No extra tooling (Turborepo, Nx) needed for a two-package project. |
| **Prisma client generated to root `node_modules`** | Workspace hoisting means both client and server share the same `node_modules`. Run `prisma generate` from `server/` — the output goes to the root. |

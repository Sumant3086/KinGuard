# Architecture

## Overview

KinMarche is a three-tier web application.

```
Browser
  React 18 SPA (Vite) — code-split by role
       |
       | HTTP/JSON  (Vite proxy in dev, direct in prod)
       v
Express API Server  (Node.js 22+)
  Helmet  CORS  compression  JWT  Multer  ExcelJS
       |
       | Prisma ORM (parameterised queries)
       v
PostgreSQL 15+
  Supabase (current) / Neon / local
```

## Component Map

```
client/src/
  shared/api/
    client.js        Axios instance — baseURL, 401 interceptor, silent refresh, progress bus
    authApi.js       login, getCurrentUser, changePassword
    adminApi.js      All admin API calls + client-side TTL cache
    storeApi.js      All store manager API calls
    cache.js         In-memory TTL Map, cleared on logout
    progress.js      Shared pub/sub bus for the top progress bar

  shared/components/
    ui/TopProgress.jsx       Fixed 3px progress bar driven by the progress bus
    ui/LoadingCard.jsx       Skeleton cards and skeleton table components
    NotificationBell.jsx     Polls /notifications every 60s, badge + dropdown

  features/admin/
    layout/AdminLayout.jsx   Red top navbar, hamburger mobile menu, notification bell
    pages/Dashboard.jsx      Network KPIs, risk scorecard, hotspot items
    pages/Upload.jsx         3-step flow: pick file -> validate preview -> confirm publish
    pages/Batches.jsx        Cycle management: deadlines, extensions, unlocks, exports
    pages/Inventory.jsx      Paginated cross-store view with admin overrides
    pages/Analytics.jsx      Multi-cycle shortage rate trend chart (SVG sparklines)
    pages/Reports.jsx        Reconciliation report with Excel and PDF export
    pages/Stores.jsx         Store CRUD + bulk delete
    pages/Users.jsx          User CRUD, approve/reject pending, batch import
    pages/AuditLogs.jsx      Immutable action log with export

  features/store/
    layout/StoreLayout.jsx   White navbar, bottom mobile nav, notification bell
    pages/Dashboard.jsx      Cycle progress, deadline countdown, past-batch alerts
    pages/Inventory.jsx      Inline count entry, debounced auto-save (700ms),
                             instant variance calculation, batch selector

server/src/
  app.js            Express setup: Helmet, CORS, compression, 1MB body cap,
                    route mounting, SPA static serving in production
  server.js         DB connect with retry, keep-alive ping, graceful shutdown

  config/
    env.js          Validates all required env vars on startup, exits if missing
    prisma.js       PrismaClient singleton

  middleware/
    auth.js         authenticate() - JWT verify + 30s user cache + DB lookup
                    requireRole() - role guard
                    requireStoreManager() - enforces storeId assignment
    errorHandler.js Converts AppError to JSON, masks 5xx detail in production

  controllers/
    authController.js   login (single retry on cold-start), getCurrentUser from req.user
    adminController.js  All admin operations
    storeController.js  Dashboard, batches, inventory CRUD, submit, download, notifications

  routes/
    authRoutes.js   POST /login, POST /refresh, POST /logout, GET /me
    adminRoutes.js  All /admin/* with ADMIN role guard, Multer for file routes
    storeRoutes.js  All /store/* with STORE_MANAGER role guard

  services/
    auditService.js    createAuditLog() - fire-and-forget, never throws
    serverCache.js     sGet/sSet/sInvalidate - in-memory TTL Map
    emailService.js    Parallel email sending via Nodemailer connection pool
    pdfService.js      PDF exports using pdfmake
```

## Data Flow

### Upload Flow

```
Admin selects file
  |
  v
POST /admin/uploads/preview
  |  parseFileToRows() - ExcelJS or csv-parse
  |  Validate each row (store code, material code, qty)
  |  Return preview array (valid / warning / error) - no DB writes
  v
Admin reviews preview
  |
  v
POST /admin/uploads
  |  1. Duplicate-date window check (+/- 3 days)
  |  2. Auto-create any new store codes found in the file
  |  3. createMany() InventoryRecords with skipDuplicates
  |  4. Update batch status to COMPLETED
  |  5. Respond immediately to the client
  |  6. Fire-and-forget: send emails to store managers in parallel
  v
Store Managers see new items in their Stock Count page
```

### Count and Submit Flow

```
Store Manager opens Stock Count
  |  GET /store/inventory?batchId=X
  |  Single query: records + batch deadline + per-store extension
  v
Manager types a count value
  |  onChange -> updateField() -> debounceTimers[id] = setTimeout(saveRecord, 700ms)
  |  Variance calculated instantly client-side for display
  v
700ms of no typing -> PATCH /store/inventory/:id
  |  Single query: verify ownership + current values + deadline + extension
  |  Re-calculate variance server-side
  |  Update physicalQuantity, difference, remarks, shrinkageCategory
  v
Manager clicks Submit Count
  |  Client-side pre-validation (all counts filled, discrepant items have category+detail)
  |  POST /store/inventory/submit
  |    Single query: fetch batch deadline + extension together
  |    Prisma $transaction (Serializable):
  |      1. Validate all pending records
  |      2. updateMany() -> status = SUBMITTED
  |    Fire-and-forget:
  |      3. detectRepeatDiscrepancies()
  |      4. Email all active admins + manager confirmation
  v
Admin notification bell shows "N stores submitted in last 24h"
```

## Frontend Architecture

### Code Splitting

Vite produces three JS bundles:

| Bundle | Contents | Loaded by |
|---|---|---|
| vendor | React, React Router, Axios | All pages |
| admin-pages | All 9 admin page components | Admin users only |
| store-pages | 2 store page components | Store managers only |

Store managers never download admin code and vice versa.

### Auth Flow

```
Page load
  |  Read localStorage kg_user (instant)
  |  Background: GET /auth/me - served from req.user (no DB hit)
  v
PrivateRoute checks user + role
  |  Not logged in -> redirect /login
  |  mustChangePassword -> redirect /change-password
  |  Wrong role -> redirect to own dashboard
  v
401 on any API call
  |  Axios interceptor in client.js
  |  Silently calls POST /auth/refresh (rotates refresh token)
  |  On success: retry original request
  |  On failure: redirect to /login
```

## Caching Strategy

### Server Cache (serverCache.js)

In-memory Map in the Node.js process.

| Key | TTL | Invalidated by |
|---|---|---|
| admin:dashboard | 5 minutes | upload, store changes, record override, batch changes |
| admin:batches | 1 minute | upload, batch delete, deadline update |

### Client Cache (shared/api/cache.js)

In-memory Map in the browser tab. Cleared on logout.

| Key | TTL |
|---|---|
| admin:dashboard | 5 minutes |
| admin:stores | 3 minutes |
| admin:users | 2 minutes |
| admin:batches | 1 minute |
| admin:uploads | 1 minute |
| admin:audit-logs | 2 minutes |
| admin:trends | 5 minutes |
| store:dashboard | 30 seconds |

## Backend Request Lifecycle

```
HTTP request
  |
  +-- Helmet (security headers)
  +-- CORS (origin whitelist from CLIENT_URL)
  +-- compression (gzip)
  +-- express.json (1 MB body cap)
  |
  +-- Route match
  |   +-- authenticate() - verify JWT, 30s user cache, attach req.user
  |   +-- requireRole('ADMIN') or requireStoreManager()
  |   +-- Controller function
  |       +-- AppError thrown -> errorHandler middleware
  |
  +-- Response
```

## Notification System

Computed on demand from existing data — no extra table.

**Store manager notifications** (`GET /store/notifications`) — queries all batches where this store has PENDING records. For each: overdue (past deadline), deadline approaching (under 48h), or pending.

**Admin notifications** (`GET /admin/notifications`) — queries the most recent COMPLETED batch. Two inventory record queries run in parallel: stores that submitted in the last 24h, and stores still pending. Results are combined and categorised.

**Polling** — `NotificationBell.jsx` calls these endpoints every 60 seconds with `setInterval` cleared on unmount.

## DoS Mitigation

| Control | Enforced by |
|---|---|
| JSON body capped at 1 MB | `express.json({ limit: '1mb' })` |
| File upload capped at 10 MB | Multer `limits.fileSize` |
| Export row limit 10,000 | Controller guard before DB fetch, returns 413 |
| Password capped at 128 chars | `validatePassword()` before bcrypt |
| All IDs and page params validated | `parseId()` / `parsePageSize()` helpers |

## File Processing Pipeline

```
Multer middleware
  |  Memory storage - file never touches disk
  |  MIME type + extension whitelist
  |  10 MB cap enforced before parsing
  v
parseFileToRows(file)
  |  CSV -> csv-parse (columns:true, trim:true)
  |  Excel -> ExcelJS
  |     Column headers mapped via COLUMN_MAP aliases
  |     cellText() flattens RichText, Hyperlink, Number to plain string
  v
Row validation loop
  |  Missing storeCode -> error
  |  Missing materialCode -> error
  |  Missing systemQty -> defaults to 0
  |  Unknown storeCode -> warning (auto-created on commit)
  v
Preview (dry run) or Commit
  |  Preview: returns colour-coded row array, no DB writes
  |  Commit: prisma.inventoryRecord.createMany({ skipDuplicates: true })
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Server-side diff calculation | Variance is always computed server-side. The client cannot send a difference value and have it accepted. |
| skipDuplicates on createMany | (batch, store, material) is unique. Re-uploading the same file is idempotent. |
| No WebSocket | Submissions happen once per cycle. Polling every 60s is simpler, cheaper, and sufficient. |
| $queryRaw for aggregations | Dashboard stats use raw SQL COUNT(CASE WHEN ...) for single-query aggregation. ORM equivalent would require N+1 queries. |
| No React state library | Context API covers auth. Two isolated user roles need no global state beyond that. |
| CSS custom properties, no framework | Full control over the brand colour system. 7 split CSS files keep concerns organised without a preprocessor. |
| Monorepo with npm workspaces | Single npm install sets up everything. No extra tooling needed for a two-package project. |
| Fire-and-forget emails | Upload and submit respond immediately. Emails send in background via parallel SMTP connections. |

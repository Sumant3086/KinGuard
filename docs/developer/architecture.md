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
  Helmet  CORS  compression  JWT cookies  Multer  ExcelJS
       |
       | Prisma ORM (parameterised queries)
       v
PostgreSQL 15+  (Supabase)
```

## Component Map

```
client/src/
  shared/api/
    client.js        Axios instance — HttpOnly cookie auth, silent token refresh, progress bus
    authApi.js       login, getCurrentUser, changePassword, updateProfile
    adminApi.js      All admin API calls + client-side TTL cache
    storeApi.js      All store manager API calls + client-side cache
    amApi.js         All area manager API calls + client-side cache
    cache.js         In-memory TTL Map, cleared on logout
    progress.js      Shared pub/sub bus for the top progress bar

  shared/components/
    ui/TopProgress.jsx       Fixed 3px progress bar driven by the progress bus
    ui/LoadingCard.jsx       Skeleton cards and skeleton table components
    ui/Modal.jsx             Portal-based modal with scroll-lock reference counting
    ui/ErrorBoundary.jsx     Catches render errors — Try again (soft) + Refresh (hard)
    NotificationBell.jsx     Polls /notifications every 60s, badge + dropdown

  features/admin/
    layout/AdminLayout.jsx   Red top navbar, hamburger mobile menu, notification bell
    pages/Dashboard.jsx      Network KPIs, risk scorecard, hotspot items
    pages/Upload.jsx         3-step flow: pick file -> validate preview -> confirm publish
    pages/Batches.jsx        Cycle management: deadlines, extensions, unlocks, close cycle, exports
    pages/Inventory.jsx      Paginated cross-store view with admin overrides
    pages/Analytics.jsx      Trend sparklines, risk scores, year-over-year comparison, cycle-vs-cycle
    pages/Reports.jsx        Reconciliation report + executive summary PDF
    pages/Stores.jsx         Store CRUD + area manager assignment
    pages/Users.jsx          User CRUD, approve/reject pending, batch import
    pages/AuditLogs.jsx      Immutable action log with export
    pages/Schedules.jsx      Create/edit/pause recurring inventory cycle schedules

  features/store/
    layout/StoreLayout.jsx   White navbar, bottom mobile nav, notification bell
    pages/Dashboard.jsx      Cycle progress, deadline countdown, past-batch alerts
    pages/Inventory.jsx      Inline count entry, debounced auto-save (700ms),
                             instant variance, batch selector, AM return messages

  features/areaManager/
    layout/AMLayout.jsx      Top navbar, mobile bottom nav, notification bell
    pages/AMDashboard.jsx    Store progress overview, per-store review status
    pages/AMReviewList.jsx   List of all cycles with review counts
    pages/AMReview.jsx       Per-store record review, edit, approve, or return for recount

server/src/
  app.js            Express setup: Helmet, CORS, compression, 1MB body cap,
                    route mounting, static SPA serving in production
  server.js         DB connect with retry, keep-alive ping, schedulers startup, graceful shutdown

  config/
    env.js          Validates all required env vars at startup — exits if any are missing
    prisma.js       PrismaClient singleton

  middleware/
    auth.js         authenticate() - JWT verify + 30s user cache + DB lookup
                    requireRole() - role guard middleware
                    requireStoreManager() - enforces storeId assignment
                    requireAreaManager() - AM role guard
    errorHandler.js Converts AppError to JSON, masks 5xx internal detail in production

  controllers/
    authController.js        login (DB-backed lockout), refresh, logout, changePassword, updateProfile
    adminController.js       All admin operations — upload, batches, inventory, reports, users, stores
    analyticsController.js   Risk scores, year-over-year trends, executive summary PDF
    scheduleController.js    Scheduled cycle CRUD
    storeController.js       Store dashboard, batches, inventory CRUD, submit, download
    areaManagerController.js AM dashboard, batch review, approve, return, record editing

  routes/
    authRoutes.js       POST /login, POST /refresh, POST /logout, GET /me, PATCH /profile
    adminRoutes.js      All /admin/* with ADMIN role guard, Multer for file routes
    storeRoutes.js      All /store/* with STORE_MANAGER role guard
    areaManagerRoutes.js All /am/* with AREA_MANAGER role guard
    adminAmRoutes.js    Admin-only AM management endpoints
    scheduleRoutes.js   All /admin/schedules/* with ADMIN role guard

  services/
    auditService.js          createAuditLog() — fire-and-forget, never throws, DB-level immutability
    serverCache.js           sGet/sSet/sInvalidate — in-memory TTL Map
    emailService.js          Brevo HTTP API — sendBulk() helper used by all bulk email functions
    pdfService.js            PDF exports using pdfmake
    reminderScheduler.js     Pre-deadline 1h reminder emails every 30 minutes
    escalationScheduler.js   Post-deadline escalation: AM at T+0h, Admin at T+24h
    cycleScheduleService.js  Hourly check for due recurring schedules, auto-creates batches

  utils/
    params.js         parseId, requireId, parsePage, parsePageSize — validates all URL/query params
    excelExport.js    buildInventoryWorkbook() — shared Excel builder used by all export endpoints
```

## Data Flow

### Upload Flow

```
Admin selects file
  |
  v
POST /admin/uploads/preview
  |  parseFileToRows() — ExcelJS or csv-parse
  |  Validate ALL rows (store code, material code, qty)
  |  Return preview array (first 100 rows shown) + full-file statistics
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
  |  6. Fire-and-forget: send emails to Area Managers
  v
Store Managers see new items, Area Managers get email notification
```

### Count and Submit Flow

```
Store Manager opens Stock Count
  |  GET /store/inventory?batchId=X
  |  Single query: records + batch deadline + per-store extension + AM review status
  v
Manager types a count value
  |  onChange -> debounceTimers[id] = setTimeout(saveRecord, 700ms)
  |  Variance calculated instantly client-side for display
  v
700ms of no typing -> PATCH /store/inventory/:id
  |  Verify ownership + deadline + extension in one query
  |  Re-calculate variance server-side
  v
Manager clicks Submit Count
  |  Client pre-validation (counts filled, discrepant items have category+detail)
  |  POST /store/inventory/submit
  |    Fetch deadline + extension + fresh areaManagerId (no cache)
  |    Prisma $transaction (Serializable isolation):
  |      1. Validate all pending records
  |      2. updateMany() status = SUBMITTED
  |    Awaited: upsert AreaManagerReview (creates review queue entry for AM)
  |    Fire-and-forget:
  |      3. detectRepeatDiscrepancies() — sets isRepeat flag on repeat shortages
  |      4. Email all active admins + manager confirmation
  v
Area Manager sees store in their review queue
```

### AM Review Flow

```
Area Manager opens store review
  |  GET /am/batches/:batchId/stores/:storeId/records
  |  Returns all records + current review status
  v
AM reviews records (can edit individual values)
  |  PATCH /am/records/:id
  |  Creates audit log entry for every AM edit
  v
AM approves or returns
  |
  +-- Approve: POST /am/batches/:batchId/stores/:storeId/approve
  |     Upserts AreaManagerReview status = APPROVED
  |     Notifies admins by email
  |
  +-- Return: POST /am/batches/:batchId/stores/:storeId/return
        Resets ALL submitted records to PENDING, clears physical counts
        Store manager must start their count again from scratch
        Sets AreaManagerReview status = RETURNED with reason
        Store manager sees the return reason in their notification bell
```

## Frontend Architecture

### Code Splitting

Vite produces four JS bundles:

| Bundle | Contents | Loaded by |
|---|---|---|
| vendor | React, React Router, Axios | All pages |
| admin-pages | All admin pages + layout | Admin users only |
| store-pages | Store pages + layout | Store managers only |
| am-pages | Area manager pages + layout | Area managers only |

Each role only downloads its own code. A store manager never downloads admin code.

### Auth Flow

```
Page load
  |  Read localStorage kg_user (instant, includes email and role)
  |  Background: GET /auth/me — served from req.user (no DB hit)
  v
PrivateRoute checks user + role
  |  Not logged in -> redirect /login
  |  mustChangePassword -> redirect /change-password
  |  Wrong role -> redirect to own dashboard
  v
401 on any API call
  |  Axios interceptor in client.js
  |  Silently calls POST /auth/refresh (rotates refresh token in DB)
  |  On success: retry original request
  |  On failure: redirect to /login
```

### PWA

A service worker (`public/sw.js`) runs in production only. It caches Vite's hashed asset bundles (cache-first) and the HTML shell (network-first with offline fallback). API calls are never cached — financial data is always fetched from the network. The app manifest enables installation as a home screen app on iOS and Android.

## Caching Strategy

### Server Cache (serverCache.js)

In-memory Map in the Node.js process. All TTLs reset on relevant mutations.

| Key | TTL | Invalidated by |
|---|---|---|
| admin:dashboard | 5 min | upload, store changes, record override, batch close |
| admin:batches | 1 min | upload, delete, deadline update, close |
| admin:stores | 2 min | store CRUD, user changes |
| admin:users | 1 min | user CRUD |
| store:dashboard | 1 min | store submit, AM return |
| store:notifications | 30 sec | store submit, AM return |
| am:batches | 1 min | AM approve/return |
| am:notifications | 30 sec | AM approve/return |

### Client Cache (shared/api/cache.js)

In-memory Map in the browser tab. Cleared on logout.

| Key | TTL |
|---|---|
| admin:dashboard | 2 min |
| admin:stores | 3 min |
| admin:users | 2 min |
| admin:batches-client | 1 min |
| admin:uploads | 1 min |
| admin:area-managers | 2 min |
| admin:trends:N | 5 min |
| store:dashboard | 2 min |
| store:batches | 1 min |
| am:dashboard | 1 min |
| am:batches | 1 min |
| am:stores | 5 min |

## Background Schedulers

Three scheduled services run inside the server process:

| Scheduler | Interval | What it does |
|---|---|---|
| reminderScheduler | Every 30 min | Sends 1-hour-before-deadline email reminders to pending store managers |
| escalationScheduler | Every 30 min | Post-deadline: emails AM at T+0h, emails Admin at T+24h if stores still pending |
| cycleScheduleService | Every 1 hour | Checks for due recurring schedules and auto-creates UploadBatch entries |

All schedulers start after a warm-up delay (2–5 min) to let the server fully connect to the database first.

## Audit Trail

Every state-changing action creates an `AuditLog` entry with: userId, action, entityType, entityId, metadata JSON, timestamp.

A PostgreSQL trigger (`prevent_audit_log_delete`) blocks all `DELETE` operations on the `AuditLog` table at the database level. Application code can insert but never delete audit records.

When a user is deleted, their audit logs remain — the userId is set to null but the action and metadata are preserved.

## Security Highlights

| Control | Implementation |
|---|---|
| Authentication | JWT in HttpOnly cookies (not localStorage). Short-lived access token (15 min) + long-lived refresh token (7 days) rotated on every use. |
| Login lockout | 10 failures locks the account for 15 minutes. State stored in the DB (not in-process memory) so it survives server restarts. |
| Store isolation | Store managers can only query records where storeId matches their own. All queries are scoped by storeId from req.user, never from request params. |
| Role guards | requireRole(), requireStoreManager(), requireAreaManager() — every route has an explicit guard. |
| Input validation | All ID and pagination params go through parseId()/parsePage() helpers. All user-input strings are length-limited before DB writes. |
| Variance integrity | Difference is always computed server-side. The client cannot influence the stored variance value. |
| Export limits | All export endpoints reject filters matching more than 10,000 records before starting the DB query. |
| Excel injection | All free-text fields sanitized in exports — values starting with =, +, -, @ are prefixed with a single quote. |

## Backend Request Lifecycle

```
HTTP request
  |
  +-- Helmet (security headers incl. CSP, HSTS)
  +-- CORS (origin whitelist from CLIENT_URL env var)
  +-- compression (gzip)
  +-- express.json (1 MB body cap)
  |
  +-- Route match
  |   +-- authenticate() — verify JWT cookie/Bearer, 30s user cache, attach req.user
  |   +-- requireRole() / requireStoreManager() / requireAreaManager()
  |   +-- Controller function
  |       +-- AppError thrown -> errorHandler (JSON error, 5xx detail masked in production)
  |
  +-- Response
```

## File Processing Pipeline

```
Multer middleware
  |  Memory storage — file never touches disk
  |  MIME type + extension whitelist
  |  10 MB cap enforced before parsing
  v
parseFileToRows(file)
  |  CSV  -> csv-parse (columns:true, trim:true)
  |  Excel -> ExcelJS
  |     Column headers mapped via COLUMN_MAP aliases (e.g. Plant/Plant Code/Store Code)
  |     cellText() flattens RichText, Hyperlink, Number to plain string
  v
Row validation loop (ALL rows — not just first 100)
  |  Missing storeCode -> error
  |  storeCode too long -> error
  |  Missing materialCode -> error
  |  materialCode too long -> error
  |  Invalid quantity -> error
  |  Unknown storeCode -> warning (auto-created on commit)
  v
Preview (dry-run) or Commit
  |  Preview: returns colour-coded first-100 rows + full-file statistics, no DB writes
  |  Commit:  prisma.inventoryRecord.createMany({ skipDuplicates: true })
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Server-side diff calculation | Variance is always computed server-side. The client cannot send a difference value and have it accepted. |
| skipDuplicates on createMany | (batch, store, material) is unique. Re-uploading the same file is idempotent. |
| No WebSocket | Submissions happen once per cycle. Polling every 60s is simpler, cheaper, and sufficient. |
| $queryRaw for aggregations | Dashboard stats use raw SQL `COUNT(CASE WHEN ...)` for single-query aggregation. ORM equivalent would require N+1 queries. |
| isRepeat stored on record | At submission time, detectRepeatDiscrepancies() sets isRepeat=true on matching records and writes to DB. getInventory() reads the flag directly — no second cross-batch query per page load. |
| Brevo HTTP API for email | Render's free tier blocks SMTP ports 25/465/587. Brevo's REST API uses HTTPS (port 443) which is never blocked. |
| Soft delete for batches | deleteBatch() sets isDeleted=true rather than hard-deleting, preserving financial reconciliation data for potential recovery. |
| DB-backed login lockout | Lockout state (loginAttempts, lockedUntil) is stored on the User row, not in process memory. Survives server restarts and deploys on Render's free tier. |
| No React state library | Context API covers auth. Role-split pages have no shared state beyond that. |
| Monorepo with npm workspaces | Single `npm install` sets up everything. No extra tooling needed for a two-package project. |

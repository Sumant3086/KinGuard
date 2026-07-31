# Architecture

## Overview

KinMarché is a three-tier web application.

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

### What the system is for, and what follows from it

KinMarché reconciles what a store's books say it has against what is physically on its shelves, and attributes the gap. Three roles form a chain: an **administrator** uploads the book figures and runs the cycle, a **store manager** counts and explains discrepancies, an **area manager** reviews and either approves or sends the count back.

One property makes the rest of the design legible: **the audited party cannot move the baseline after their count is final.** `systemQuantity` normally arrives with the upload, but that column may be left blank on purpose for the store to supply, so the store can write it — and only while the record is still `PENDING`. It locks at submission, at the same instant as the count, and no record can reach `SUBMITTED` with either figure blank. The area manager cannot write it at all; an administrator can, through the audited override, which is the only correction path once a store has submitted. Everything downstream follows from that: the variance is always recomputed on the server rather than accepted from a client, corrections flow through recounts and audited overrides rather than in-place edits, cycles are soft-deleted rather than erased, and the audit log is protected by a database trigger rather than by convention.

If you take one thing from this document into a code change, take that. It is documented in full in `security.md` under *Data Integrity*.

## Component Map

```
client/src/
  App.jsx            Route table — every path in the app is declared here
  main.jsx           React root, i18n init, service worker registration (production only)

  i18n/
    index.js         i18next setup, language detection, persistence
    en.json          English strings
    fr.json          French strings — kept at exact key parity with en.json

  pages/
    Home.jsx         Public landing page
    ProfilePage.jsx  Name / email / phone — rendered outside every role layout
    NotFound.jsx     404 fallback

  features/auth/
    AuthContext.jsx        Session state, login/logout, refreshUser, route guards
    LoginPage.jsx          Employee ID + password
    ChangePasswordPage.jsx Forced when mustChangePassword is set

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
    ui/ConfirmModal.jsx      Confirm/cancel dialog built on Modal
    ui/EmptyState.jsx        Shared empty and no-results state
    ui/PageHeader.jsx        Title + subtitle + actions block used by every page
    ui/ErrorBoundary.jsx     Catches render errors — Try again (soft) + Refresh (hard)
    NotificationBell.jsx     Polls /notifications every 60s, badge + dropdown

  shared/context/
    ToastContext.jsx  Toast queue — success/error notifications

  shared/hooks/
    useDebounce.js    Debounced value, used by search boxes and count auto-save
    useDownload.js    Blob download with in-flight state and error surfacing

  shared/utils/
    dateUtils.js            Date formatting and deadline comparison
    downloadBlob.js         Triggers a browser download from a response blob
    shrinkageCategories.js  Canonical 9 categories + their issue details
                            (must stay in sync with the server copy)

  styles/            tokens.css (design tokens) + reset, layout, components,
                     inventory, pages, toast, utilities — plain CSS, no framework

  features/admin/
    layout/AdminLayout.jsx   Crimson navbar with green accent, hamburger mobile menu, bell
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
    layout/StoreLayout.jsx   Crimson navbar with teal accent, bottom mobile nav, bell
    pages/Dashboard.jsx      Cycle progress, deadline countdown, past-batch alerts
    pages/Inventory.jsx      Inline count entry, debounced auto-save (700ms),
                             instant variance, batch selector, AM return messages

  features/areaManager/
    layout/AMLayout.jsx      Crimson navbar with blue accent, mobile bottom nav, bell
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
    adminController.js       Barrel — re-exports everything in admin/ so adminRoutes.js has one import
    admin/shared.js          withDbRetry, cache fan-out, temp passwords, validation limits
    admin/dashboard.js       Admin dashboard, trends, notifications
    admin/stores.js          Store CRUD and the several kinds of store deletion
    admin/users.js           User CRUD, approval, rejection, and the spreadsheet import
    admin/uploads.js         Inventory upload pipeline: preview, publish, sample template
    admin/inventory.js       Cross-store inventory reads and admin overrides
    admin/batches.js         Cycle deadlines, extensions, unlocks, closing, reminders
    admin/reports.js         Reconciliation reports and every Excel/PDF export
    admin/audit.js           Audit log read and export
    analyticsController.js   Risk scores, year-over-year trends, executive summary PDF
    scheduleController.js    Scheduled cycle CRUD
    storeController.js       Store dashboard, batches, inventory CRUD, submit, download
    areaManagerController.js AM dashboard, batch review, approve, return, record editing

  routes/
    authRoutes.js       POST /login, POST /refresh, POST /logout, GET /me,
                        POST /change-password, PATCH /profile
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
    schedulerLock.js         withSchedulerLock() — DB lease so only one instance runs a job
    errorReporter.js         Optional JSON webhook for 5xx faults — no-ops when unconfigured

  utils/
    params.js              parseId, requireId, parsePage, parsePageSize, parseIntParam
                           — validates all URL/query params
    excelExport.js         buildInventoryWorkbook() — shared Excel builder used by all exports
    shrinkageCategories.js Canonical category set — mirror of the client copy

server/tests/integration/
  guard.js           Aborts the run unless DATABASE_URL is a local throwaway database
  helpers.js         resetDb, fixture builders, and a controller runner with a mock res
  *.int.test.js      Real controllers against real PostgreSQL — excluded from `npm test`

client/public/
  sw.js              Service worker — hashed assets cache-first, HTML shell
                     network-first, API never cached. Registered in production only
  manifest.json      PWA manifest (installable, standalone display)
  _redirects         SPA fallback for static hosts
```

### Internationalisation

The interface ships in English and French via `react-i18next`. Every user-facing string in the store and shared surfaces goes through `t()`; `en.json` and `fr.json` are kept at exact key parity, including i18next plural suffixes (`_one` / `_other`). The selected language is detected from the browser and persisted per browser.

Data the user types — store names, remarks, issue details — is stored verbatim and never translated. Shrinkage category *values* stay canonical English in the database (`Theft`, `Miscount`, …) and are translated only for display, so a French user's submission is queryable alongside an English one.

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

Every page in `App.jsx` is behind `React.lazy`, so Rollup emits one chunk per route and
lifts what two routes share — the role layout, the API client, the shared UI components —
into common chunks it loads alongside. Only one group is declared by hand:

| Bundle | Contents | Loaded by |
|---|---|---|
| vendor | React, React Router, Axios | All pages |

Everything else is left to Rollup on purpose. There used to be `admin-pages`,
`store-pages` and `am-pages` groups listing each role's routes, and naming them undid the
lazy loading they appeared to be helping. Grouping ten lazy routes into one chunk means
opening the admin dashboard downloads the user management screen, the analytics screen
and the rest of it — 234 kB to render four cards. Worse, the entry statically imports
i18n, the auth context and the toast context, and Rollup had assigned those shared
modules to the named chunks; the entry therefore had to preload them. The public landing
page and the login screen were pulling the entire admin bundle and the entire store
bundle before showing anything.

Removing the groups cut the first paint from roughly 582 kB to 305 kB, and the admin
dashboard from 582 kB to about 350 kB. The largest single page, user management at
54 kB, now downloads only when someone opens `/admin/users`.

The lesson generalises: `manualChunks` is for code with a shared *cache lifetime*, like
the vendor bundle, which is worth pinning so it survives deploys that only touch
application code. It is not a tool for grouping by feature, and using it that way
silently defeats route-level splitting.

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
| admin:dashboard | 5 min | upload, store changes, record override, batch close/delete |
| admin:batches | 1 min | upload, delete, deadline update, close, unlock |
| admin:stores | 2 min | store CRUD, user changes, AM assignment, upload (auto-created stores) |
| admin:users | 1 min | user CRUD, upload (auto-created placeholder managers) |
| admin:notifications | 30 sec | upload, submit, AM approve, batch close/delete |
| admin:trends:N | 5 min | upload, batch close/delete |
| store:dashboard:{storeId} | 1 min | store submit, AM return, admin override, batch close/delete |
| store:notifications:{storeId} | 30 sec | store submit, AM return, admin override, batch close/delete |
| am:batches:{userId} | 1 min | AM approve/return, store assignment change, batch close/delete |
| am:notifications:{userId} | 30 sec | AM approve/return, store assignment change, batch close/delete |

Keys carrying an ID suffix are per-store or per-user; the rest are global.

### Invalidation crosses role boundaries

The non-obvious rule: **a write invalidates every role's view of the data it changed, not just the writer's own.**

Deleting or closing a cycle is the clearest case. It happens in the admin controller, but the rows it hides belong to store managers and area managers who each have their own cached dashboard and notification payload. `invalidateBatchAudience(batchId)` resolves the distinct stores in that cycle and their area managers, and busts all of their keys alongside the admin's. Without it a store manager keeps seeing a deleted cycle on their dashboard for up to a minute, clicks into it, and gets an error — the exact class of "ghost cycle" bug this indirection exists to prevent.

The same reasoning applies in the other direction. An upload can auto-create stores and placeholder manager accounts, so it busts `admin:stores` and `admin:users` even though neither is the endpoint's own resource. A bulk override busts the store and area manager caches for every store it touched. An area manager reassignment busts the caches of both the previous and the new manager, which is why `assignStoreAM` reads the old `areaManagerId` before writing rather than after.

When adding a write path, the question to answer is not "which cache did I just make stale for me" but "who else is looking at this row".

### Client Cache (shared/api/cache.js)

In-memory Map in the browser tab. Cleared on logout, with a sweep of expired entries every 2 minutes.

| Key | TTL |
|---|---|
| admin:dashboard | 2 min |
| admin:stores | 3 min |
| admin:users | 2 min |
| admin:audit-logs:{limit}:{action} | 2 min |
| admin:batches-client | 1 min |
| admin:area-managers | 2 min |
| admin:trends:N | 5 min |
| store:dashboard | 2 min |
| store:batches | 1 min |
| am:dashboard | 1 min |
| am:batches | 1 min |

The two layers are independent and their TTLs deliberately differ, so the staleness a user can observe is the longer of the pair — `admin:users`, for instance, is 1 minute on the server but 2 in the browser. Client-side mutations call `cacheInvalidate(...)` with the affected keys immediately, so a user never waits on a TTL to see their own change.

`invalidate()` deletes exact keys only; there is no prefix matching. A parameterised key such as `admin:trends:N` therefore has to be invalidated by naming each N that the app actually requests — currently 8, from the Analytics page. Adding a new cycles value to a call site means adding it to the invalidation lists too, on both sides.

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
| Book stock immutability | `systemQuantity` is writable only by the upload pipeline. No role — including admin, including the override endpoints — has a write path to it. See `security.md`. |
| Variance integrity | Difference is always computed server-side. The client cannot influence the stored variance value. |
| Rate limiting | 20 logins / 15 min / IP on `/api/auth/login`; 600 / 15 min on the rest of `/api/auth` (store networks share one NAT'd IP); 30 / min on heavy exports and analytics. |
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

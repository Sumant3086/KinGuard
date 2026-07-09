# KinMarché — Loss & Prevention Platform

A centralised multi-store inventory reconciliation system that helps retail operations teams track, measure, and act on stock shrinkage in real time.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [Default Login](#default-login)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Discrepancy Logic](#discrepancy-logic)
- [Security](#security)

---

## Overview

Multi-store retailers lose millions to shrinkage every year — and most don't catch it until it's too late. KinMarché solves this by replacing fragmented spreadsheets and manual processes with a single platform where:

- Administrators upload one master inventory file and it instantly distributes to every store.
- Store managers count their stock, enter sold quantities, and submit — all in one session.
- The system calculates discrepancies instantly, flags repeat losses, and surfaces high-risk stores before losses compound.

---

## How It Works

```
1. Admin uploads master Excel / CSV file
         ↓
2. Platform splits records by Store Code automatically
         ↓
3. Store Managers enter Sold quantities + Remarks per item
         ↓
4. Platform calculates:  Diff = Sold − System Qty
         ↓
5. Manager submits their store's count
         ↓
6. Admin sees full network picture — risk scores, hotspots, downloadable reports
```

---

## Features

### Administrator

| Feature | Description |
|---------|-------------|
| File Upload | Upload one Excel or CSV file for all stores — the system splits by Store Code |
| Preview Before Commit | Validate the file row-by-row before publishing to stores |
| Auto Store Creation | New store codes found in the file are created automatically |
| Duplicate Detection | Warns when a batch for the same date already exists; force-override available |
| Submission Deadlines | Set per-cycle deadlines; stores are locked after the deadline passes |
| Deadline Extensions | Grant individual store extensions without affecting the rest |
| Store Risk Scorecard | Every store ranked as High Risk / Watch / Healthy based on shortage rate |
| Shrinkage Hotspots | Highlights (store, item) pairs with shortages across multiple consecutive cycles |
| Repeat Discrepancy Flags | Items that shortage in previous batches are automatically marked |
| Inventory View | Full paginated view with filters by store, batch, status, discrepancy type |
| Excel Export | Export any filtered view to Excel with one click |
| Batch Management | View all cycles, update deadlines, export per-batch data |
| Analytics | Multi-cycle shortage rate trend charts per store |
| Audit Log | Full immutable trail of every action in the system |
| Store & User Management | Create, edit, and deactivate stores and user accounts |

### Store Manager

| Feature | Description |
|---------|-------------|
| Scoped Data | Only the manager's own store is visible — enforced server-side |
| Auto-Save | Quantities and remarks save automatically as the manager types |
| Live Diff | Diff column (Sold − SYS) updates in real time without a round-trip |
| Progress Bar | Shows how many items have been counted vs. remaining |
| Submit Batch | One-click batch submit with a summary of matched / shortage / excess |
| Deadline Lock | Clear locked message when the submission deadline has passed |
| Post-Submit View | After submission, a read-only summary of the full count is shown |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Vite, custom CSS |
| Backend | Node.js, Express.js |
| ORM | Prisma 5 |
| Database | PostgreSQL (tested with Supabase) |
| Auth | JWT (HS256), bcrypt password hashing |
| File Parsing | ExcelJS (xlsx), csv-parse |
| File Upload | Multer (memory storage, 10 MB cap) |
| Security | Helmet, CORS, express-rate-limit |
| Compression | compression (gzip) |

---

## Architecture

```
KinGuard/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── api/             # Axios wrappers + client-side cache
│       ├── components/      # Shared layout components
│       ├── context/         # AuthContext (JWT storage & refresh)
│       ├── pages/
│       │   ├── admin/       # Admin pages
│       │   └── store/       # Store Manager pages
│       ├── assets/          # Brand images (logo, store backgrounds)
│       └── styles/          # Split CSS: tokens · reset · layout · components
│                            #            inventory · pages · toast
│
└── server/                  # Express backend
    ├── prisma/
    │   ├── schema.prisma    # Database schema
    │   ├── migrations/      # Auto-generated migration files
    │   └── seed.js          # Creates admin account on first run
    └── src/
        ├── config/          # env.js (validation), prisma.js (singleton client)
        ├── controllers/     # adminController.js, authController.js, storeController.js
        ├── middleware/      # auth.js (JWT + RBAC), errorHandler.js
        ├── routes/          # adminRoutes.js, authRoutes.js, storeRoutes.js
        └── services/        # auditService.js, serverCache.js, emailService.js, pdfService.js
```

### Data Flow

```
Browser ──HTTPS──▶ Express ──Prisma──▶ PostgreSQL
                      │
                 JWT middleware
                 (every request)
                      │
                 Role guard
                 (ADMIN vs STORE_MANAGER)
```

### Caching

- **Client**: In-memory TTL cache (30–120 s) per resource type. Cleared on logout.
- **Server**: In-memory TTL cache (30 s) for the admin dashboard aggregation query.

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v8 or later
- **PostgreSQL** database (local or cloud — Supabase, Neon, Railway, etc.)

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd KinGuard
```

### 2. Install all dependencies

```bash
npm install
npm install --workspace=client
npm install --workspace=server
```

Or use the convenience script:

```bash
npm run install:all
```

### 3. Configure environment variables

```bash
cp .env.example server/.env
```

Edit `server/.env` with your database credentials and a strong JWT secret:

```env
DATABASE_URL=postgresql://user:password@host:5432/kinguard
JWT_SECRET=your-random-secret-min-32-characters
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

> **Generate a secure secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

### 4. Run database migrations

```bash
npm run migrate
```

### 5. Seed the admin account

```bash
npm run seed
```

This creates a single administrator account. No sample data is inserted.

### 6. Start the development servers

In two separate terminals:

```bash
# Terminal 1 — backend (port 5000)
npm run dev:server

# Terminal 2 — frontend (port 5173)
npm run dev:client
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables

All variables live in `server/.env`. Copy from `.env.example`.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (pooled) |
| `DIRECT_URL` | Supabase only | Non-pooled URL for Prisma migrations |
| `JWT_SECRET` | Yes | HS256 signing key — minimum 32 characters |
| `JWT_EXPIRES_IN` | No | Token lifetime, default `8h` |
| `PORT` | Yes | Server port, default `5000` |
| `NODE_ENV` | Yes | `development` or `production` |
| `CLIENT_URL` | Yes | Frontend origin for CORS, e.g. `http://localhost:5173` |

---

## Database Setup

### Schema overview

| Table | Purpose |
|-------|---------|
| `Store` | Store locations (storeCode, storeName, isActive) |
| `User` | Admin and Store Manager accounts |
| `UploadBatch` | One record per file upload / inventory cycle |
| `InventoryRecord` | One row per (store, item, batch) |
| `BatchDeadlineExtension` | Per-store deadline overrides |
| `AuditLog` | Immutable action log |

### Migrations

```bash
# Apply migrations to an existing database
npm run migrate

# Create a new migration during development
cd server && npx prisma migrate dev --name <description>
```

### Clear all operational data (keep users)

```bash
npm run db:clear
```

Deletes all stores, inventory records, upload batches, and audit logs — while preserving all user accounts. Use this to remove test data or auto-created stores without losing your user setup.

### Full reset (destructive)

```bash
npm run db:reset
```

Drops all tables, re-runs all migrations, and creates only the admin account. Use this to start completely from scratch.

---

## Running the App

### Development

```bash
npm run dev:client    # Vite dev server → http://localhost:5173
npm run dev:server    # Express with --watch → http://localhost:5000
```

### Production build

```bash
npm run build:client  # Outputs to client/dist/
npm run migrate       # Apply any pending migrations
npm run seed          # Ensure admin account exists
npm start --workspace=server
```

Serve `client/dist/` with any static host (Nginx, Vercel, Netlify, Cloudflare Pages). Point `CLIENT_URL` in `server/.env` to the deployed frontend origin.

---

## Default Login

After running `npm run seed`, one account is created:

| Field | Value |
|-------|-------|
| Employee ID | `ADMIN001` |
| Password | `Admin@123` |
| Role | Administrator |

**Change this password immediately** after first login via Admin → Users.

The admin account can then create stores and store manager accounts through the UI — no additional seeding is needed.

---

## API Reference

All routes are prefixed with `/api`. Authentication uses a Bearer token in the `Authorization` header.

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | None | Login; returns JWT token |
| `GET` | `/auth/me` | Required | Current user profile |

**Login request body:**
```json
{ "employeeId": "ADMIN001", "password": "Admin@123" }
```

**Login response:**
```json
{
  "token": "<jwt>",
  "user": { "id": 1, "employeeId": "ADMIN001", "name": "...", "role": "ADMIN" }
}
```

---

### Admin Endpoints

All require `Authorization: Bearer <token>` with role `ADMIN`.

#### Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/dashboard` | Store scorecard, hotspots, network summary for the latest batch |

#### Stores

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/stores` | List all stores |
| `POST` | `/admin/stores` | Create a store |
| `PATCH` | `/admin/stores/:id` | Update store name or active status |

**Create store body:**
```json
{ "storeCode": "2050", "storeName": "Downtown Branch", "isActive": true }
```

#### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users` | List all users |
| `POST` | `/admin/users` | Create a user |
| `PATCH` | `/admin/users/:id` | Update name, password, store assignment, or active status |

**Create user body:**
```json
{
  "employeeId": "MGR2050",
  "name": "Jane Doe",
  "password": "SecurePass@1",
  "role": "STORE_MANAGER",
  "storeId": 5
}
```

#### File Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/uploads/preview` | Validate a file without committing (multipart/form-data) |
| `POST` | `/admin/uploads` | Commit an upload; add `?force=true` to override duplicate-date warning |
| `GET` | `/admin/uploads` | Upload history |

**Preview / upload form fields:**
- `file` — Excel (.xlsx, .xls) or CSV file
- `inventoryDate` — `YYYY-MM-DD`
- `submissionDeadline` — `YYYY-MM-DD` (optional, upload only)

**Expected column names in the file (any alias is accepted):**

| Field | Accepted column names |
|-------|-----------------------|
| Store Code | `Plant`, `Store Code`, `StoreCode`, `store_code` |
| Material Code | `Material`, `Material Code`, `SKU`, `MATERIAL` |
| Material Name | `Material Description`, `Description`, `material_name` |
| System Qty | `System Stock`, `System  Stock`, `SYS`, `QTY` |
| Remarks | `Remarks`, `remarks`, `Remark`, `Note` |

#### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/inventory` | Paginated inventory records with filters |
| `GET` | `/admin/inventory/export` | Download filtered records as Excel |

**Query params for `/admin/inventory`:**

| Param | Type | Description |
|-------|------|-------------|
| `storeId` | int | Filter by store |
| `batchId` | int | Filter by batch |
| `status` | string | `PENDING` or `SUBMITTED` |
| `discrepancy` | string | `shortage`, `excess`, or `matched` |
| `search` | string | Search material code or name |
| `page` | int | Page number (default 1) |
| `pageSize` | int | Records per page (default 50) |

#### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/reports/reconciliation` | Reconciliation report (JSON) |
| `GET` | `/admin/reports/reconciliation/download` | Download as Excel |

#### Batches

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/batches` | All inventory cycles with per-store stats |
| `PATCH` | `/admin/batches/:id` | Update submission deadline |
| `POST` | `/admin/batches/extend` | Grant a store-specific deadline extension |
| `GET` | `/admin/batches/:batchId/export` | Download full batch as Excel |

**Extend deadline body:**
```json
{ "batchId": 3, "storeId": 2, "newDeadline": "2025-08-15", "note": "Stock count delayed" }
```

#### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/analytics/trends` | Shortage rate trends across last N cycles |
| `GET` | `/admin/stores/:storeId/drilldown` | Shortage details for one store in one batch |

**Trends query params:**
- `cycles` — number of batches to include (default 6)

#### Audit Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/audit-logs` | Recent actions; filter by `action`, `limit` |

---

### Store Manager Endpoints

All require `Authorization: Bearer <token>` with role `STORE_MANAGER`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/store/dashboard` | Store progress summary for the active batch |
| `GET` | `/store/inventory` | Pending inventory items for this store |
| `PATCH` | `/store/inventory/:id` | Save sold quantity and remarks for one item |
| `POST` | `/store/inventory/submit` | Submit all items for this store |

**Save item body:**
```json
{ "physicalQuantity": 95, "remarks": "Damaged in transit" }
```

All store endpoints enforce store isolation at the database query level — a store manager can only read and write records belonging to their assigned store.

---

## Project Structure

```
KinGuard/
├── .env.example                   # Environment variable template
├── .gitignore
├── package.json                   # Monorepo root
├── README.md
│
├── client/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── api/
│       │   ├── admin.js           # Admin API calls + client cache
│       │   ├── auth.js            # Login / me
│       │   ├── cache.js           # In-memory TTL cache
│       │   ├── client.js          # Axios instance (base URL, auth header)
│       │   └── store.js           # Store manager API calls
│       ├── components/
│       │   ├── AdminLayout.jsx    # Top nav for admin pages
│       │   └── StoreLayout.jsx    # Layout for store manager pages
│       ├── context/
│       │   └── AuthContext.jsx    # JWT storage, login, logout
│       ├── pages/
│       │   ├── Home.jsx           # Landing / redirect
│       │   ├── Login.jsx          # Login form
│       │   ├── NotFound.jsx       # 404
│       │   ├── admin/
│       │   │   ├── Analytics.jsx
│       │   │   ├── AuditLogs.jsx
│       │   │   ├── Batches.jsx
│       │   │   ├── Dashboard.jsx
│       │   │   ├── Inventory.jsx
│       │   │   ├── Reports.jsx
│       │   │   ├── Stores.jsx
│       │   │   ├── Upload.jsx
│       │   │   └── Users.jsx
│       │   └── store/
│       │       ├── Dashboard.jsx
│       │       └── Inventory.jsx
│       └── styles/
│           └── index.css          # Design tokens + all component styles
│
└── server/
    ├── package.json
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seed.js                # Admin account initialisation
    └── src/
        ├── app.js                 # Express app setup (middleware, routes)
        ├── server.js              # Entry point (DB connect, listen)
        ├── config/
        │   ├── env.js             # Env var validation + export
        │   └── prisma.js          # Prisma singleton
        ├── controllers/
        │   ├── adminController.js
        │   ├── authController.js
        │   └── storeController.js
        ├── middleware/
        │   ├── auth.js            # JWT verification + role guards
        │   └── errorHandler.js    # Centralised error format
        ├── routes/
        │   ├── adminRoutes.js
        │   ├── authRoutes.js
        │   └── storeRoutes.js
        └── services/
            ├── auditService.js    # Writes audit log entries
            └── serverCache.js     # In-memory TTL cache
```

---

## Discrepancy Logic

The platform is the single source of truth for every Diff calculation. Nothing is computed client-side and trusted.

| System Qty (SYS) | Sold | Diff (Sold − SYS) | Result |
|------------------:|-----:|-------------------:|--------|
| 100 | 100 | 0 | Matched |
| 100 | 90 | −10 | **Shortage** (loss / shrinkage) |
| 100 | 110 | +10 | Excess |

**Risk levels** are calculated per store per batch:

| Shortage Rate | Risk Level |
|:-------------:|:----------:|
| ≥ 20% | High Risk (RED) |
| 5–19% | Watch (YELLOW) |
| < 5% | Healthy (GREEN) |

**Shrinkage Hotspots** are (store, item) pairs that appear in shortage status across 2 or more of the last 4 batches.

---

## Security

- Passwords are hashed with bcrypt (10 rounds).
- JWT tokens are signed with HS256 and expire after 8 hours by default.
- Every request to protected endpoints validates the token and checks the user's role.
- Store isolation is enforced at the database query level — a store manager query always filters by `storeId = req.user.storeId`, regardless of request parameters.
- HTTP security headers are applied by Helmet.
- File uploads are validated by MIME type and capped at 10 MB before any parsing begins.
- SQL injection is prevented by Prisma's parameterised queries.
- Rate limiting is applied via `express-rate-limit`.
- Never commit `server/.env` to version control — it is listed in `.gitignore`.

---

*KinMarché — built for KinGuard Loss & Prevention operations.*

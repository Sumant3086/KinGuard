<div align="center">

# KinMarché — Loss & Prevention Platform

**Inventory Reconciliation & Loss Monitoring for Retail Networks**

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-blue)

</div>

---

## Overview

KinMarché is an internal Loss & Prevention platform for multi-store retail operations. Administrators upload a master inventory file once per cycle; each store manager records physical counts through a guided, auto-saving interface. The system calculates variances automatically, surfaces recurring shortage patterns, and produces reconciliation reports for L&P review.

**Built for:** Multi-store retail networks · Kinshasa, DRC  
**Roles:** Administrator · Store Manager

---

## Features

### Admin Panel

| Feature | Description |
|---|---|
| **Dashboard** | Network-wide KPIs — submission rate, total shortage units, per-store risk scorecard, top hotspot items |
| **Upload** | Upload `.xlsx`, `.xls`, or `.csv` master files; auto-creates stores and store-manager accounts |
| **Batches** | Manage inventory cycles — set deadlines, extend per-store, send email/WhatsApp reminders, delete cycles |
| **Inventory** | Cross-store inventory view with filters, sorting, quantity override, and Excel/PDF export |
| **Analytics** | Trend charts, shortage heatmaps, material-level recurring discrepancy analysis |
| **Reports** | Configurable Excel and PDF reconciliation reports by batch, store, and date range |
| **Stores** | Create, edit, and deactivate stores; force-delete with full cascade cleanup |
| **Users** | Manage admins and store managers; temp-password flow; role-based access; account activation |
| **Audit Logs** | Immutable log of every write action with actor, timestamp, and metadata |

### Store Manager Portal

| Feature | Description |
|---|---|
| **Dashboard** | Active batch summary, submission status, deadline countdown, per-cycle variance stats |
| **Inventory Entry** | Row-by-row physical count with real-time diff display, autosave, jump-to-next-blank, and submit flow |
| **Excel Export** | Download own store's full reconciliation report at any time |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router 6, Axios |
| Backend | Node.js 18+, Express 4, ESM modules |
| Database | PostgreSQL 14+ via Prisma ORM 5.22 |
| Auth | JWT access tokens (8h) + refresh tokens (7d), HttpOnly cookies, bcrypt v6 |
| File Processing | ExcelJS (XLSX read/write), csv-parse, Multer v2 |
| PDF Generation | pdfmake |
| Email | Nodemailer (any SMTP — Gmail, Brevo, etc.) |
| Security | Helmet, CORS, HTTP compression, 1 MB body cap |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9 (workspace support required)
- A **PostgreSQL** database — [Supabase free tier](https://supabase.com) works out of the box

### 1. Clone & install

```bash
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard
npm install
```

> `prisma generate` runs automatically via `postinstall` — no manual step needed.

### 2. Configure environment

Copy the example file and fill in your values:

```bash
cp .env.example server/.env
```

Minimum required in `server/.env`:

```env
DATABASE_URL=postgresql://user:pass@host:5432/kinmarche?pgbouncer=true
DIRECT_URL=postgresql://user:pass@host:5432/kinmarche
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

See the [Environment Variables](#environment-variables) section below for the full reference.

### 3. Set up the database

```bash
npm run migrate    # Apply all Prisma migrations
npm run seed       # Create the default admin account
```

**Default admin credentials** (change immediately after first login):

| Employee ID | Password |
|---|---|
| `ADMIN001` | `Admin@123` |

### 4. Start development servers

```bash
npm run dev
```

Starts both the API server (`:5000`) and the React dev server (`:5173`) concurrently. Open [http://localhost:5173](http://localhost:5173).

---

## Project Structure

```
KinGuard/
├── client/                     # React + Vite frontend
│   ├── src/
│   │   ├── features/
│   │   │   ├── admin/          # Admin pages (Dashboard, Stores, Users, Upload, …)
│   │   │   ├── store/          # Store Manager pages (Dashboard, Inventory)
│   │   │   └── auth/           # Login, ChangePassword, AuthContext
│   │   ├── pages/              # Home, NotFound
│   │   ├── shared/
│   │   │   ├── api/            # Axios client + authApi / adminApi / storeApi
│   │   │   ├── components/     # Modal, ConfirmModal, PageHeader, EmptyState, …
│   │   │   ├── context/        # ToastContext
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   └── utils/          # Formatting helpers
│   │   └── styles/             # Design-system CSS (tokens, reset, layout, components, …)
│   ├── public/                 # favicon.svg / .ico / .png
│   └── index.html
│
├── server/                     # Express API
│   ├── src/
│   │   ├── controllers/        # adminController, authController, storeController
│   │   ├── middleware/         # auth (JWT + role guard), errorHandler
│   │   ├── routes/             # authRoutes, adminRoutes, storeRoutes
│   │   ├── services/           # emailService, pdfService, auditService, serverCache
│   │   ├── config/             # env.js (validated vars), prisma.js (client singleton)
│   │   ├── utils/              # params.js (query/body helpers)
│   │   ├── app.js              # Express app setup (middleware, routes)
│   │   └── server.js           # HTTP server, graceful shutdown, DB keep-alive
│   └── prisma/
│       ├── schema.prisma
│       ├── migrations/
│       ├── seed.js             # Seeds ADMIN001 / Admin@123
│       └── clear-all.js        # Wipes all data, preserves schema
│
├── .env.example                # Template for all environment variables
└── package.json                # Workspace root
```

---

## Scripts

All commands run from the **project root**.

| Command | Description |
|---|---|
| `npm run dev` | Start both API server and React dev server concurrently |
| `npm run dev:server` | API server only (port 5000, auto-restarts on file change) |
| `npm run dev:client` | React dev server only (port 5173, HMR) |
| `npm run build:client` | Production build of the React frontend → `client/dist/` |
| `npm run migrate` | Apply pending Prisma migrations (production-safe) |
| `npm run seed` | Create default admin account |
| `npm run db:reset` | **Destructive** — drop all data, re-migrate, re-seed |
| `npm run db:clear` | Delete all operational data while keeping the schema |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Pooled PostgreSQL connection string (used by the app) |
| `DIRECT_URL` | Yes | — | Non-pooled connection string (used by Prisma CLI / migrations) |
| `JWT_SECRET` | Yes | — | Min 32 random characters — signs all access tokens |
| `JWT_EXPIRES_IN` | No | `8h` | Access token lifetime |
| `PORT` | No | `5000` | Express server port |
| `NODE_ENV` | No | `development` | `development` or `production` |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend origin — used for CORS |
| `SMTP_HOST` | No | — | SMTP server hostname; leave blank to disable email |
| `SMTP_PORT` | No | `587` | SMTP port (`587` = TLS, `465` = SSL) |
| `SMTP_USER` | No | — | SMTP username / sending address |
| `SMTP_PASS` | No | — | SMTP password or app-specific password |
| `SMTP_FROM` | No | — | "From" display name and address |

---

## Data Model

```
Store ──< InventoryRecord >── UploadBatch
  │                                │
  └──< User (STORE_MANAGER)        └──< BatchDeadlineExtension
  │
  └── (ADMIN) → AuditLog
```

### Column naming note

The database field names differ from the labels shown in the UI and Excel exports. This is intentional:

| DB field | UI / Excel label |
|---|---|
| `materialCode` | Material Name (item identifier) |
| `materialName` | Material Description |
| `physicalQuantity` | Sold (physical count entered by store) |
| `systemQuantity` | SYS (system stock from master file) |
| `difference` | Diff (shortage = negative, excess = positive) |

---

## API Routes

All routes are prefixed with `/api`.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Authenticate; sets HttpOnly JWT cookies |
| POST | `/auth/logout` | Auth | Clear cookies |
| POST | `/auth/refresh` | Cookie | Issue new access token from refresh token |
| POST | `/auth/change-password` | Auth | Change own password |
| GET | `/admin/dashboard` | ADMIN | Network KPIs, hotspots, scorecard |
| GET | `/admin/stores` | ADMIN | List stores |
| POST | `/admin/stores` | ADMIN | Create store |
| PUT | `/admin/stores/:id` | ADMIN | Update store |
| DELETE | `/admin/stores/:id` | ADMIN | Delete store (atomic cascade) |
| GET | `/admin/users` | ADMIN | List users |
| POST | `/admin/users` | ADMIN | Create user |
| PUT | `/admin/users/:id` | ADMIN | Update user |
| DELETE | `/admin/users/:id` | ADMIN | Delete user |
| POST | `/admin/upload` | ADMIN | Upload inventory file (multipart) |
| GET | `/admin/inventory` | ADMIN | Paginated cross-store inventory |
| GET | `/admin/inventory/export` | ADMIN | Download Excel export |
| POST | `/admin/inventory/:id/override` | ADMIN | Override record remarks/quantity |
| GET | `/admin/batches` | ADMIN | List upload batches |
| DELETE | `/admin/batches/:id` | ADMIN | Delete batch (atomic transaction) |
| POST | `/admin/batches/:id/notify` | ADMIN | Send email reminders |
| GET | `/admin/reports` | ADMIN | Generate PDF or Excel report |
| GET | `/admin/analytics` | ADMIN | Trend and heatmap data |
| GET | `/admin/audit-logs` | ADMIN | Paginated audit log |
| GET | `/store/dashboard` | STORE_MANAGER | Own store KPIs + active batch |
| GET | `/store/batches` | STORE_MANAGER | Own batch list |
| GET | `/store/inventory` | STORE_MANAGER | Own inventory for a batch |
| PATCH | `/store/inventory/:id` | STORE_MANAGER | Save a single row |
| POST | `/store/inventory/submit` | STORE_MANAGER | Submit entire cycle |
| GET | `/store/inventory/export` | STORE_MANAGER | Download own store's Excel |
| GET | `/api/health` | Public | Health check (`{ status: "ok" }`) |

---

## Email Notifications

Email is **optional** — if no SMTP variables are set the server skips notifications silently.

| Trigger | Recipients |
|---|---|
| New inventory batch uploaded | All assigned store managers with an email on file |
| Admin clicks "Email Reminder" on a batch | Pending store managers for that batch |
| Store manager submits their cycle | Admin (`ADMIN_EMAIL` env var, if set) |

WhatsApp reminders use `wa.me` click-to-chat links — no API key required. Admins click "WhatsApp" on a batch row and the browser opens a pre-filled message.

---

## Security

- Passwords hashed with **bcrypt** (cost 10)
- JWTs stored in **HttpOnly, Secure cookies** — never in `localStorage`
- Silent token refresh with concurrent-request queue to prevent refresh storms
- **Helmet** sets CSP, X-Frame-Options, X-Content-Type-Options, and other headers
- Request body capped at **1 MB** to limit DoS surface
- All write operations logged to the **AuditLog** table
- Deactivated users are rejected even when holding a valid cached token
- Account enumeration prevented — password is verified before account-state errors are surfaced
- Batch and store cascade-deletes run inside **Prisma transactions** (atomic)

---

## Development Notes

- **DB cold-start:** Supabase drops idle connections after ~5 minutes. The server pings the DB every 4 minutes to keep the pool alive.
- **Token refresh:** Access tokens expire in 8 hours; refresh tokens last 7 days and are rotated on each use.
- **File uploads:** Max 10 MB. Accepted formats: `.xlsx`, `.xls`, `.csv`.
- **Prisma client:** Regenerate manually if needed: `cd server && npx prisma generate`
- **Lint:** Both workspaces enforce zero ESLint warnings — run `npm run lint --workspace=client` and `npm run lint --workspace=server` before committing.

---

## License

ISC — Developed by **Sumant Yadav**

*KinMarché · Loss & Prevention Platform · Kinshasa, DRC*

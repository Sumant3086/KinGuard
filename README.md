<div align="center">

<img src="client/src/assets/img/logo 32px32px.png" alt="KinMarché Logo" width="80" height="80" />

# KinMarché

### Loss & Prevention Inventory Reconciliation Platform

**One upload. Every store. Real-time shrinkage visibility.**

---

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-red?style=flat-square)

[Getting Started](#getting-started) · [Documentation](docs/) · [API Reference](docs/api-reference.md) · [Architecture](docs/architecture.md)

</div>

---

## What is KinMarché?

KinMarché is an internal Loss & Prevention platform built for multi-store retail operations. It replaces fragmented spreadsheets and manual reconciliation workflows with a centralised system where:

- **Administrators** upload one master Excel file and it distributes automatically to every store
- **Store Managers** count their stock and submit — all within one focused interface
- **L&P Teams** get instant risk scores, recurring loss alerts, and one-click Excel exports

```
Admin uploads master file   →   Platform splits by Store Code
        ↓
Store Managers enter counts  →   Server calculates Variance = Counted − Book Stock
        ↓
Admin sees network-wide risk scores, hotspots, and trend charts
```

---

## Features

### For Administrators

| Feature | Description |
|---------|-------------|
| **File Upload & Validation** | Upload Excel or CSV for all stores with a live preview before committing |
| **Auto Store Creation** | New store codes in the file are created automatically |
| **Duplicate Detection** | Warns on same-date uploads; force-override available |
| **Deadline Management** | Set per-cycle submission deadlines with per-store extensions |
| **Store Risk Scorecard** | Every store ranked High Risk / Watch / On Track by shortage rate |
| **Shrinkage Hotspots** | Flags (store, item) pairs with losses across 2+ consecutive cycles |
| **Repeat Discrepancy Flags** | Items that shortage in previous cycles are automatically marked |
| **Inventory View** | Paginated, filterable view across all stores and cycles |
| **Excel & PDF Export** | Download any filtered view or full batch report |
| **Analytics** | Multi-cycle shortage rate trend charts per store |
| **Audit Log** | Immutable trail of every action in the system |
| **In-App Notifications** | Real-time bell showing recent submissions, overdue stores, and deadlines |

### For Store Managers

| Feature | Description |
|---------|-------------|
| **Scoped Access** | Only the manager's own store is visible — enforced server-side |
| **Auto-Save** | Counts and remarks save automatically as the manager types |
| **Live Variance** | Variance column updates in real time without a server round-trip |
| **Progress Tracking** | Progress bar showing items counted vs. remaining |
| **Past-Cycle Visibility** | Dashboard surfaces older pending cycles when admin uploads for past dates |
| **Submit & Report** | One-click submit with a post-submission discrepancy summary |
| **Deadline Lock** | Clear lock message and contact prompt when the deadline has passed |
| **In-App Notifications** | Bell alerts for new cycles, approaching deadlines, and submission locks |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite | SPA with code-split bundles per user role |
| Styling | Custom CSS (7 focused files) | Design tokens, no external CSS framework |
| Backend | Node.js + Express | REST API with role-based access control |
| ORM | Prisma 5 | Type-safe database queries, migrations |
| Database | PostgreSQL 15 | Primary data store (tested with Supabase) |
| Auth | JWT (HS256) + bcrypt | Stateless auth, 10-round password hashing |
| File Parsing | ExcelJS + csv-parse | Excel (.xlsx, .xls) and CSV support |
| File Upload | Multer (memory storage) | 10 MB cap, MIME-type validation |
| Security | Helmet + CORS + express-rate-limit | HTTP hardening, brute-force protection |
| Email | Nodemailer (SMTP) | Optional submission and new-cycle notifications |

---

## Getting Started

**Prerequisites:** Node.js 18+, npm 8+, PostgreSQL 15+

### 1. Clone and install

```bash
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard
npm run install:all
```

### 2. Configure environment

```bash
cp .env.example server/.env
```

Edit `server/.env` — the minimum required values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/kinmarche
JWT_SECRET=<min-32-char-random-string>
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

> **Generate a secure JWT secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

### 3. Run database migrations

```bash
npm run migrate
```

### 4. Create the admin account

```bash
npm run seed
```

Creates one admin account — `ADMIN001` / `Admin@123`. **Change the password immediately** after first login.

### 5. Start development servers

```bash
# Terminal 1 — API server (port 5000)
npm run dev:server

# Terminal 2 — React frontend (port 5173)
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173).

---

## Default Credentials

| Field | Value |
|-------|-------|
| Employee ID | `ADMIN001` |
| Password | `Admin@123` |
| Role | Administrator |

> ⚠️ Change this password before using in any production or shared environment.

---

## Project Structure

```
KinGuard/
├── .env.example                    # Environment variable template
├── package.json                    # Monorepo root (npm workspaces)
│
├── client/                         # React frontend (Vite)
│   └── src/
│       ├── api/                    # Axios wrappers + client-side TTL cache
│       ├── assets/img/             # Brand images (logo, store backgrounds)
│       ├── components/             # AdminLayout, StoreLayout, NotificationBell
│       ├── context/                # AuthContext (JWT storage, login, logout)
│       ├── pages/
│       │   ├── admin/              # Dashboard, Upload, Batches, Inventory…
│       │   └── store/              # Dashboard, Stock Count (Inventory)
│       └── styles/                 # 7 CSS files: tokens · reset · layout
│                                   #              components · inventory · pages · toast
│
├── server/                         # Express backend
│   ├── prisma/
│   │   ├── schema.prisma           # Database schema
│   │   ├── migrations/             # Auto-generated migration files
│   │   └── seed.js                 # Admin account initialisation
│   └── src/
│       ├── app.js                  # Middleware, rate limiting, route mounting
│       ├── server.js               # Entry point
│       ├── config/                 # env.js (validation), prisma.js (singleton)
│       ├── controllers/            # adminController, authController, storeController
│       ├── middleware/             # JWT auth, role guards, error handler
│       ├── routes/                 # Admin, auth, and store route definitions
│       └── services/               # auditService, serverCache, emailService, pdfService
│
└── docs/                           # Full project documentation
    ├── getting-started.md
    ├── architecture.md
    ├── api-reference.md
    ├── database-schema.md
    ├── deployment.md
    ├── security.md
    └── user-guide/
        ├── admin-guide.md
        └── store-manager-guide.md
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Full installation, configuration, and first-run guide |
| [Architecture](docs/architecture.md) | System design, data flow, caching, and component map |
| [API Reference](docs/api-reference.md) | Complete REST API documentation with request/response examples |
| [Database Schema](docs/database-schema.md) | Table definitions, relationships, indexes, and data dictionary |
| [Admin Guide](docs/user-guide/admin-guide.md) | How to use every admin feature end-to-end |
| [Store Manager Guide](docs/user-guide/store-manager-guide.md) | Store manager workflow from login to submission |
| [Deployment](docs/deployment.md) | Production deployment, environment config, and reverse proxy setup |
| [Security](docs/security.md) | Security model, threat controls, and operational checklist |

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run install:all` | Install all workspace dependencies |
| `npm run dev:client` | Start Vite dev server (port 5173) |
| `npm run dev:server` | Start Express with `--watch` (port 5000) |
| `npm run build:client` | Production build → `client/dist/` |
| `npm run migrate` | Apply pending Prisma migrations |
| `npm run seed` | Create/ensure admin account exists |
| `npm run db:reset` | Drop all tables, re-migrate, re-seed (⚠️ destructive) |
| `npm run db:clear` | Clear all operational data, keep user accounts |

---

## Discrepancy Logic

Variance is always computed server-side. Clients cannot manipulate figures.

| Book Stock | Counted | Variance | Outcome |
|-----------:|--------:|:--------:|---------|
| 100 | 100 | 0 | ✅ Matched |
| 100 | 90 | −10 | 🔴 Shortage (shrinkage / loss) |
| 100 | 110 | +10 | 🟣 Surplus (excess) |

**Store risk levels** are calculated as shortage rate per cycle:

| Shortage Rate | Risk Level |
|:---:|:---:|
| ≥ 20% | 🔴 High Risk |
| 5 – 19% | 🟡 Watch |
| < 5% | 🟢 On Track |

---

## Security Highlights

- Passwords hashed with **bcrypt** (10 rounds)
- JWT signed with **HS256**, expires after 8 hours
- **Role-based access control** on every protected endpoint
- **Store isolation** enforced at the database query level — a manager can never read or write another store's data
- HTTP hardening via **Helmet** (CSP, HSTS, X-Frame-Options…)
- **Rate limiting**: 10 requests / 15 min on auth endpoints; 300 requests / min on API endpoints
- File uploads validated by **MIME type** and capped at **10 MB** before parsing
- SQL injection prevented by **Prisma parameterised queries**

See [docs/security.md](docs/security.md) for the full security model.

---

## License

ISC © [Sumant Yadav](https://github.com/Sumant3086)

---

<div align="center">
<img src="client/src/assets/img/logo 32px32px.png" alt="KinMarché" width="32" height="32" />
<br/>
<sub>KinMarché · Kinshasa, DRC · Loss & Prevention Platform</sub>
</div>

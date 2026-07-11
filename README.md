<div align="center">

<img src="client/src/assets/img/logo 32px32px.png" alt="KinMarché" width="64" height="64" />

# KinMarché — Loss & Prevention Platform

**Inventory Reconciliation & Loss Monitoring for Retail Networks**

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)

</div>

---

## Overview

KinMarché is an internal Loss & Prevention system for multi-store retail operations. Administrators upload a master inventory file once per cycle; each store manager records their physical counts through a guided interface. The system calculates variances automatically, surfaces recurring shortage patterns, and produces reconciliation reports for L&P review.

**Built for:** Kinshasa, DRC retail operations  
**Language:** English  
**Roles:** Administrator, Store Manager

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Inventory Cycles** | Upload an Excel/CSV master file to create a count cycle assigned to all stores |
| **Store Count Entry** | Store managers enter physical quantities through a structured, auto-saving form |
| **Variance Calculation** | Shortage, excess, and matched items calculated automatically server-side |
| **Risk Scorecard** | Per-store shortage rate, risk level (High / Watch / On Track), and overdue tracking |
| **Recurring Loss Detection** | Flags items with shortages across 2+ consecutive cycles |
| **Reconciliation Reports** | Filterable Excel and PDF exports by store, cycle, status, and discrepancy type |
| **Audit Trail** | Immutable log of every admin and store action |
| **Email Notifications** | New-cycle alerts, submission confirmations, and deadline reminders via SMTP |
| **Deadline Extensions** | Per-store deadline overrides without affecting other stores |
| **Submission Unlock** | Admins can reset a submitted store's count for re-counting |
| **User Approval Workflow** | Auto-created store accounts require admin approval before first login |
| **PDF Exports** | All major reports also available as PDF downloads |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, React Router 6, Axios |
| Backend | Node.js 18, Express 4 |
| Database | PostgreSQL 14+ via Prisma ORM 5.22 |
| Auth | JWT (HttpOnly cookies) + refresh token rotation |
| File Processing | ExcelJS (XLSX), csv-parse |
| PDF Generation | pdfmake |
| Email | Nodemailer (SMTP) |
| Password Hashing | bcrypt v6 |

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm 8+
- PostgreSQL 14+ (or a managed service: Supabase, Neon, Railway)

### Install

```bash
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard
npm install
```

### Configure

```bash
# Copy and fill in the server environment variables
cp server/.env.example server/.env
```

Minimum required variables in `server/.env`:

```env
DATABASE_URL=postgresql://user:pass@host:5432/kinmarche?pgbouncer=true
DIRECT_URL=postgresql://user:pass@host:5432/kinmarche
JWT_SECRET=<at-least-32-random-characters>
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### Set Up Database

```bash
npm run migrate   # Apply all Prisma migrations
npm run seed      # Create the default admin account
```

Default admin credentials after seeding:

| Employee ID | Password |
|-------------|----------|
| `ADMIN001` | `Admin@123` |

> Change this password immediately after first login.

### Run

```bash
npm run dev
```

This starts both the API server (port 5000) and the React dev server (port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173).

---

## Project Structure

```
KinGuard/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── features/        # Feature-based modules
│       │   ├── admin/       # Admin pages and layout
│       │   ├── auth/        # Login, change password
│       │   └── store/       # Store manager pages and layout
│       ├── shared/          # Reusable components, hooks, utils, API layer
│       └── pages/           # Top-level pages (Home, NotFound)
├── server/                  # Node.js + Express API
│   ├── prisma/              # Schema, migrations, seed
│   └── src/
│       ├── controllers/     # Route handlers (admin, auth, store)
│       ├── middleware/       # Auth, error handler
│       ├── routes/          # Express routers
│       ├── services/        # Email, PDF, server-side cache, audit
│       ├── config/          # Environment, Prisma client
│       └── utils/           # Parameter parsing
└── docs/                    # Technical and user documentation
```

---

## Scripts

### Root (runs across workspaces)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both API server and React dev server concurrently |
| `npm run dev:server` | API server only (port 5000, auto-restarts on change) |
| `npm run dev:client` | React dev server only (port 5173) |
| `npm run build:client` | Production build of the React app |
| `npm run migrate` | Apply pending Prisma migrations |
| `npm run seed` | Create the default admin account |
| `npm run db:reset` | Drop all tables, re-migrate, re-seed |
| `npm run db:clear` | Delete all operational data (keeps schema) |

---

## Documentation

Full technical and user documentation is in the [`docs/`](docs/) directory.

| Document | Audience |
|----------|----------|
| [Getting Started](docs/getting-started.md) | Developers |
| [Architecture](docs/architecture.md) | Developers |
| [API Reference](docs/api-reference.md) | Developers / Integrators |
| [Database Schema](docs/database-schema.md) | Developers / DBAs |
| [Deployment](docs/deployment.md) | DevOps / Developers |
| [Security](docs/security.md) | Developers / Security |
| [Admin Guide](docs/user-guide/admin-guide.md) | Administrators |
| [Store Manager Guide](docs/user-guide/store-manager-guide.md) | Store Managers |

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Pooled PostgreSQL connection string |
| `DIRECT_URL` | Yes | Non-pooled URL (Prisma migrations) |
| `JWT_SECRET` | Yes | Min 32 characters. Used to sign access tokens |
| `PORT` | Yes | Express server port (default: 5000) |
| `NODE_ENV` | Yes | `development` or `production` |
| `CLIENT_URL` | No | Frontend origin for CORS (defaults to `http://localhost:5173`) |
| `SMTP_HOST` | No | SMTP hostname for email notifications |
| `SMTP_PORT` | No | SMTP port (587 or 465) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password or app password |
| `SMTP_FROM` | No | From address for outgoing emails |

---

## Development Notes

- **Prisma client** is generated automatically via `postinstall`. If you need to regenerate manually: `cd server && npx prisma generate`
- **DB cold-start**: Supabase drops idle connections after ~5 minutes. The server pings the DB every 4 minutes to keep the connection alive.
- **Auth**: Access tokens expire in 15 minutes; refresh tokens last 7 days and rotate on each use.
- **File uploads**: Max 10 MB. Accepted formats: `.xlsx`, `.xls`, `.csv`.

---

## License

ISC — Developed by **Sumant Yadav**

*KinMarché · Kinshasa, DRC*

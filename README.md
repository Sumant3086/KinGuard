<div align="center">

<img src="client/src/assets/img/HomePage.png" alt="KinMarche Home Page" width="100%" />

# KinMarche — Loss & Prevention Platform

**Track inventory. Spot shortages. Stop losses.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-kinmarchae.onrender.com-dc2626?style=for-the-badge)](https://kinmarchae.onrender.com)

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)

</div>

## What is KinMarche?

KinMarche is an internal inventory reconciliation system built for multi-store retail networks. It replaces manual spreadsheet exchanges between head office and store managers with a structured, auditable digital workflow.

**For store managers** — receive your assigned item list, enter your physical counts directly in the browser, and submit. No spreadsheets, no emails, no confusion about which file version is correct.

**For administrators and L&P managers** — upload one master file to kick off a cycle. Monitor every store's progress in real time, see who is behind, spot recurring shortage patterns, and export reconciliation reports for finance review.

**For senior management** — a live dashboard showing network-wide submission rates, shortage hotspots, and trend data across multiple inventory cycles.

## Screenshots

<div align="center">

| Admin Dashboard | Store Count Entry |
|:---:|:---:|
| <img src="client/src/assets/img/AdminPage.png" width="480" alt="Admin Dashboard" /> | <img src="client/src/assets/img/StoreManagerPage.png" width="480" alt="Store Count Entry" /> |

</div>

## Live Demo

**[https://kinmarchae.onrender.com](https://kinmarchae.onrender.com)**

> The demo runs on Render's free tier and may take up to 60 seconds to wake from sleep on the first visit. Wait a moment and the login page will appear.

## Features

### For Administrators

| Feature | What it does |
|---|---|
| Dashboard | Live network overview — submission rate, shortage counts, per-store risk scorecard, recurring loss items |
| Upload | Upload an Excel or CSV master file to start a new inventory cycle. Stores and user accounts are auto-created from the file. |
| Cycles | Set submission deadlines, grant per-store extensions, send email reminders, unlock a store's submission for recount |
| Inventory | Cross-store inventory view with filters by store, status, and discrepancy type. Override any record directly. |
| Reports | Reconciliation reports filtered by store, cycle, and discrepancy type. Download as Excel or PDF. |
| Analytics | Shortage rate trend chart across multiple cycles per store. Identifies worsening stores and recurring items. |
| Stores | Create, edit, deactivate, or delete store locations |
| Users | Create store manager and admin accounts, approve pending registrations, bulk import via Excel |
| Activity Log | Immutable record of every action in the system with timestamps and context |

### For Store Managers

| Feature | What it does |
|---|---|
| Dashboard | Progress summary for the active cycle — items counted vs. remaining, deadline countdown |
| Inventory Count | Enter physical counts row by row. Auto-saves as you type. Variance calculated instantly. |
| Discrepancy notes | Required category and issue detail for any item that doesn't match book stock |
| Submit | One-click submission once all items are filled. Triggers email confirmation to admin. |
| Download | Export your store's reconciliation report as Excel at any time |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router 6, Axios |
| Backend | Node.js 22+, Express 4, ESM modules |
| Database | PostgreSQL 15+ via Prisma ORM |
| Auth | JWT access + refresh tokens, HttpOnly cookies, bcrypt |
| File Processing | ExcelJS, csv-parse, Multer |
| PDF | pdfmake |
| Email | Nodemailer (Gmail / any SMTP) |
| Hosting | Render (backend + frontend), Supabase (database) |

## Local Setup

**Requirements:** Node.js 22+, npm 9+, PostgreSQL (or a Supabase project)

### 1. Clone and install

```bash
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard
npm install --include=dev
```

### 2. Configure environment

```bash
cp .env.example server/.env
```

Open `server/.env` and fill in at minimum:

```env
DATABASE_URL=postgresql://user:pass@host:5432/kinmarche?pgbouncer=true
DIRECT_URL=postgresql://user:pass@host:5432/kinmarche
JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### 3. Set up the database

```bash
npm run migrate    # run Prisma migrations
npm run seed       # create the default admin account
```

The seed script prints the admin credentials to the console. Change the password immediately after first login.

### 4. Start

```bash
npm run dev
```

Opens the API on port 5000 and the React app on port 5173. Visit [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API server and React dev server together |
| `npm run dev:server` | API server only |
| `npm run dev:client` | React dev server only |
| `npm run build:client` | Build React frontend for production |
| `npm run migrate` | Apply Prisma migrations |
| `npm run seed` | Create default admin account |
| `npm run db:reset` | Drop all data, re-migrate, re-seed (destructive) |
| `npm run db:clear` | Delete all operational data, keep user accounts |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled PostgreSQL URL used by the app |
| `DIRECT_URL` | Yes | Direct PostgreSQL URL used by Prisma migrations |
| `JWT_SECRET` | Yes | At least 32 random characters |
| `PORT` | Yes | Server port (Render sets this automatically) |
| `NODE_ENV` | Yes | `development` or `production` |
| `CLIENT_URL` | Yes | Frontend origin for CORS (no trailing slash) |
| `JWT_EXPIRES_IN` | No | Access token lifetime, default `8h` |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port, default `587` |
| `SMTP_USER` | No | SMTP username / sending address |
| `SMTP_PASS` | No | SMTP password or Gmail App Password |
| `SMTP_FROM` | No | From display name and address |

Email is fully optional. Leave all SMTP variables blank to disable notifications.

## Deployment

The app is deployed on Render as a single web service — the backend serves both the API and the built React frontend.

See [docs/deployment.md](docs/deployment.md) for the full Render setup, VPS instructions, and deployment checklist.

## Documentation

| Document | Audience |
|---|---|
| [Store Manager Guide](docs/user-guide/store-manager-guide.md) | Store managers completing a stock count |
| [Administrator Guide](docs/user-guide/admin-guide.md) | Admins running cycles, monitoring stores, exporting reports |
| [Getting Started](docs/getting-started.md) | Developers setting up the project locally |
| [Deployment](docs/deployment.md) | DevOps — Render, VPS, database setup |
| [Architecture](docs/architecture.md) | Backend team — component map, data flow, caching |
| [Security](docs/security.md) | Security model, auth, store isolation, audit trail |
| [API Reference](docs/api-reference.md) | All REST endpoints with request/response examples |
| [Database Schema](docs/database-schema.md) | Tables, relationships, indexes |
| [Limitations](docs/LIMITATIONS.md) | Capacity, limits, performance expectations |

## License

ISC — Developed by Sumant Yadav

*KinMarche · Loss & Prevention Platform · Kinshasa, DRC*

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

**For area managers** — monitor the stores assigned to you, review their submissions, approve counts that look right, or send them back for recount with a written reason.

**For administrators and L&P managers** — upload one master file to kick off a cycle. Monitor every store's progress in real time, see who is behind, spot recurring shortage patterns, and export reconciliation reports for finance review.

**For senior management** — a live dashboard with network-wide submission rates, shortage hotspots, trend data, risk scores, and a one-page executive summary PDF.

## Live Demo

**[https://kinmarchae.onrender.com](https://kinmarchae.onrender.com)**

> The demo runs on Render's free tier, kept warm by an automated health-check monitor — no cold-start wait expected on first visit.

## Features

### For Administrators

| Feature | What it does |
|---|---|
| Dashboard | Live network overview — submission rate, shortage counts, per-store risk scorecard, recurring loss items |
| Upload | Upload an Excel or CSV master file to start a new inventory cycle. Stores and user accounts are auto-created from the file. Preview and validate before publishing. |
| Cycles | Set submission deadlines, grant per-store extensions, send email reminders, unlock a store's submission for recount, close a cycle early |
| Inventory | Cross-store inventory view with filters by store, status, and discrepancy type. Override any record directly. |
| Reports | Reconciliation reports filtered by store, cycle, and discrepancy type. Download as Excel or PDF. One-click executive summary PDF for management. |
| Analytics | Shortage rate trends across multiple cycles. Year-over-year comparison. Store risk scores (0–100) with peer benchmarking. Top 10 at-risk items. |
| Schedules | Configure recurring inventory cycles (weekly, monthly, quarterly) so cycles start automatically without manual uploads. |
| Stores | Create, edit, deactivate, or delete store locations. Assign area managers. |
| Users | Create store manager, area manager, and admin accounts. Approve pending registrations. Bulk import via Excel. |
| Activity Log | Immutable record of every action in the system. Database-level protection prevents deletion. |
| Escalation | Automatic email escalation when stores miss the deadline: area managers at deadline, admins after 24h. |

### For Area Managers

| Feature | What it does |
|---|---|
| Dashboard | Progress summary for all assigned stores — submission status per store, pending reviews |
| Review Submissions | View each store's inventory counts side by side. Edit individual records before approving. |
| Approve | Mark a store's submission as approved, passing it to admin for final review |
| Return for Recount | Send a store's submission back with a written reason — store manager recounts from scratch |
| Notifications | Bell badge shows stores awaiting review and upcoming deadline warnings |

### For Store Managers

| Feature | What it does |
|---|---|
| Dashboard | Progress summary for the active cycle — items counted vs. remaining, deadline countdown |
| Inventory Count | Enter physical counts row by row. Auto-saves as you type. Variance calculated instantly. |
| Discrepancy notes | Required category and issue detail for any item that doesn't match book stock. 9 categories with specific sub-reasons. |
| Submit | One-click submission once all items are filled. Triggers email confirmation. |
| Download | Export your store's reconciliation report as Excel at any time |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, React Router 6, Axios |
| Backend | Node.js 22+, Express 4, ESM modules |
| Database | PostgreSQL 15+ via Prisma ORM |
| Auth | JWT access + refresh tokens in HttpOnly cookies, bcrypt, DB-backed lockout |
| File Processing | ExcelJS, csv-parse, Multer |
| PDF | pdfmake |
| Email | Brevo HTTP API (no SMTP required — works on all hosting platforms) |
| PWA | Web App Manifest + Service Worker (installable, offline shell) |
| Localization | English / French UI, persisted per user (i18next) |
| Hosting | Render (backend + frontend), Supabase (database) |

## Local Setup

**Requirements:** Node.js 22+, npm 9+, PostgreSQL (or a Supabase project)

### 1. Clone and install

```bash
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard
npm install
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
| `npm run test:unit` | Run backend unit tests (Vitest) |
| `npm run test:e2e` | Run frontend end-to-end tests (Playwright) |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled PostgreSQL URL used by the app |
| `DIRECT_URL` | Yes | Direct PostgreSQL URL used by Prisma migrations |
| `JWT_SECRET` | Yes | At least 32 random characters |
| `PORT` | Yes | Server port (Render sets this automatically) |
| `NODE_ENV` | Yes | `development` or `production` |
| `CLIENT_URL` | Yes | Frontend origin for CORS (no trailing slash) |
| `BREVO_API_KEY` | No | Brevo API key for email notifications. Free at brevo.com (300 emails/day). Leave blank to disable emails. |
| `SMTP_FROM` | No | Sender display name and email, e.g. `KinMarché <noreply@kinmarche.com>` |
| `ADMIN_EMAIL` | No | Fallback admin email if no admin has an email address in the database |

Email is fully optional. The system works completely without it.

## Deployment

The app is deployed on Render as a single web service — the backend serves both the API and the built React frontend.

See [docs/developer/deployment.md](docs/developer/deployment.md) for the full Render setup, VPS instructions, and deployment checklist.

## Documentation

Plain-language guides for people using the app, and technical references for people building or running it — see [docs/](docs/) for the full index.

| Document | Audience |
|---|---|
| [Store Manager Guide](docs/user/store-manager-guide.md) | Store managers completing a stock count |
| [Area Manager Guide](docs/user/area-manager-guide.md) | Area managers reviewing and approving store submissions |
| [Administrator Guide](docs/user/admin-guide.md) | Admins running cycles, monitoring stores, exporting reports |
| [Limitations](docs/user/limitations.md) | Capacity, limits, performance expectations — plain language |
| [Getting Started](docs/developer/getting-started.md) | Developers setting up the project locally |
| [Deployment](docs/developer/deployment.md) | DevOps — Render, VPS, database setup |
| [Architecture](docs/developer/architecture.md) | Backend team — component map, data flow, caching |
| [Security](docs/developer/security.md) | Security model, auth, store isolation, audit trail |
| [API Reference](docs/developer/api-reference.md) | All REST endpoints with request/response examples |
| [Database Schema](docs/developer/database-schema.md) | Tables, relationships, indexes |

## License

ISC — Developed by Sumant Yadav

*KinMarché · Loss & Prevention Platform · Kinshasa, DRC*

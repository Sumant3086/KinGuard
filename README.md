<div align="center">

<img src="client/src/assets/img/HomePage.jpg" alt="KinMarché Home Page" width="100%" />

# KinMarché — Loss & Prevention Platform

**Track inventory. Spot shortages. Stop losses.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-kinmarchae.onrender.com-dc2626?style=for-the-badge)](https://kinmarchae.onrender.com)

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)

</div>

## What is KinMarché?

KinMarché is an internal inventory reconciliation system built for multi-store retail networks. It reconciles what a store's books say it holds against what is physically counted on its shelves, and attributes the difference. It replaces manual spreadsheet exchanges between head office and store managers with a structured, auditable digital workflow.

**For store managers** — receive your assigned item list, enter your physical counts directly in the browser, and submit. No spreadsheets, no emails, no confusion about which file version is correct.

**For area managers** — monitor the stores assigned to you, review their submissions, approve counts that look right, or send them back for recount with a written reason.

**For administrators and L&P managers** — upload one master file to kick off a cycle. Monitor every store's progress in real time, see who is behind, spot recurring shortage patterns, and export reconciliation reports for finance review.

**For senior management** — a live dashboard with network-wide submission rates, shortage hotspots, trend data, risk scores, and a one-page executive summary PDF.

### The one rule everything rests on

**Once a count is final, the figure it is measured against cannot be moved by the people being measured.** Shrinkage is the gap between the book figure and the physical count, so both freeze at the same instant: the store's book stock and its count lock together at submission, and no record can be submitted with either one blank. An Area Manager can never edit book stock. An administrator can, through the Override screen — that path exists because the upload deliberately allows the book stock column to be left blank for the store to fill in, so a wrong baseline is something a store can introduce and re-uploading the whole cycle to fix one figure is no remedy. Every such correction is written to the audit log with its before and after values. Where this is enforced in code, and what the store's open-window write access costs, is documented in [Security](docs/developer/security.md) and [Database Schema](docs/developer/database-schema.md).

The interface is available in English and French, and the choice is remembered per user.

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
| Frontend | React 18, Vite 5, React Router 7, Axios |
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
| `npm run lint --workspace=client` | Lint the React app |
| `npm run lint --workspace=server` | Lint the API |

The two lint runs are separate on purpose — the workspaces use different ESLint majors and different globals, so a single combined run would silently skip files. Run both, plus `npm run test:unit` and `npm run build:client`, before pushing.

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
| `ERROR_WEBHOOK_URL` | No | Endpoint that receives a JSON POST for every server fault. Leave blank to disable error reporting. |
| `ERROR_WEBHOOK_TOKEN` | No | Sent as `Authorization: Bearer` with each report, if the endpoint needs one |

Email is fully optional. The system works completely without it. So is error reporting —
with `ERROR_WEBHOOK_URL` unset nothing is sent anywhere, and 5xx faults are recorded in
the server log exactly as before.

## Deployment

The app is deployed on Render as a single web service — the backend serves both the API and the built React frontend.

See [docs/developer/deployment.md](docs/developer/deployment.md) for the full Render setup, VPS instructions, and deployment checklist.

## Documentation

Everything lives under [docs/](docs/) — plain-language guides for the people who use the app day to day, and technical references for the people building and running it.

**Where to start**

| If you are… | Read |
|---|---|
| Setting the project up locally | [Getting Started](docs/developer/getting-started.md), then [Architecture](docs/developer/architecture.md) |
| Changing server code | [Architecture](docs/developer/architecture.md) and [Security](docs/developer/security.md) before you touch `InventoryRecord` |
| Integrating with the API | [API Reference](docs/developer/api-reference.md) |
| Deploying or on call | [Deployment](docs/developer/deployment.md) |
| Counting stock in a store | [Store Manager Guide](docs/user/store-manager-guide.md) |
| Reviewing store submissions | [Area Manager Guide](docs/user/area-manager-guide.md) |
| Running cycles for the network | [Administrator Guide](docs/user/admin-guide.md) |

**[docs/user/](docs/user/)** — no technical background assumed.

| Document | Covers |
|---|---|
| [Store Manager Guide](docs/user/store-manager-guide.md) | Signing in, entering counts, submitting a cycle, handling a returned submission |
| [Area Manager Guide](docs/user/area-manager-guide.md) | Reviewing, editing, approving, and returning store submissions |
| [Administrator Guide](docs/user/admin-guide.md) | Running cycles, managing stores and users, deadlines, reports, analytics |
| [Limitations](docs/user/limitations.md) | File size, session length, and other real-world limits, in plain terms |

**[docs/developer/](docs/developer/)** — for anyone building, deploying, or maintaining the platform.

| Document | Covers |
|---|---|
| [Getting Started](docs/developer/getting-started.md) | Local setup, environment variables, npm scripts, the checks to run before pushing |
| [Architecture](docs/developer/architecture.md) | Component map, data flows, caching and invalidation, i18n, design decisions |
| [API Reference](docs/developer/api-reference.md) | Every REST endpoint with request/response examples |
| [Database Schema](docs/developer/database-schema.md) | Tables, relationships, indexes, soft deletes, what is writable and by whom |
| [Security](docs/developer/security.md) | Auth, access control, data integrity, rate limiting, secrets, incident checklist |
| [Deployment](docs/developer/deployment.md) | Render, Supabase, VPS + PM2 + Nginx, email setup, operating notes |

These docs are versioned with the code. If you change behaviour that one of them describes, change the doc in the same commit.

## License

Proprietary — All Rights Reserved. This is closed-source software developed by Sumant Yadav. No part of this codebase may be copied, modified, or redistributed without written permission.

*KinMarché · Loss & Prevention Platform · Kinshasa, DRC*

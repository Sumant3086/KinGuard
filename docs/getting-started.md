# Getting Started

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js | 18.0+ | LTS recommended |
| npm | 8.0+ | Comes with Node.js |
| PostgreSQL | 14.0+ | Or a managed service: Supabase, Neon, Railway |
| Git | Any | For cloning the repo |

## Clone & Install

```bash
# Clone the repository
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard

# Install all workspace dependencies in one command
npm run install:all
```

This installs dependencies for the monorepo root, the `client/` workspace, and the `server/` workspace.

## Environment Variables

All server configuration lives in `server/.env`. Copy the template:

```bash
cp .env.example server/.env
```

Then open `server/.env` and fill in each value:

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string. For Supabase, use the **pooled** connection URL. | `postgresql://user:pass@host:5432/KinMarche |
| `DIRECT_URL` | Non-pooled URL. Required only for Supabase (used by Prisma migrations). For local PostgreSQL, set the same as `DATABASE_URL`. | `postgresql://user:pass@host:5432/KinMarche |
| `JWT_SECRET` | Secret key for signing JWT tokens. Must be at least 32 characters. | (generate below) |
| `PORT` | Port the Express server listens on. | `5000` |
| `NODE_ENV` | Runtime environment. | `development` |
| `CLIENT_URL` | Frontend origin for CORS. Must match the actual URL. | `http://localhost:5173` |

### Optional Variables (Email Notifications)

Leave these blank to disable email notifications entirely. The system works fully without them.

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or App Password |
| `SMTP_FROM` | From address used in outgoing emails |

### Generate a Secure JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the output into your `.env` file as the value of `JWT_SECRET`.

## Database Setup

### Run Migrations

Apply the database schema to your PostgreSQL instance:

```bash
npm run migrate
```

This runs `prisma migrate deploy` which applies all pending migrations in `server/prisma/migrations/`.

### Seed the Admin Account

```bash
npm run seed
```

Creates a single administrator account if it does not already exist. The credentials are printed to your console when the seed runs — copy them, then **change the password immediately** after your first login via Admin → Users.

### Verify the Schema

To open Prisma Studio and inspect your database tables:

```bash
cd server && npx prisma studio
```

## Running in Development

Start both servers with a single command:

```bash
npm run dev
```

This uses `concurrently` to start the API server (port 5000) and the React dev server (port 5173) together, with colour-coded output per process.

To start them separately (e.g. for isolated debugging):

```bash
# API server only — restarts automatically on file changes
npm run dev:server

# React dev server only
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

The Vite dev server proxies all `/api/*` requests to `localhost:5000`, so there are no CORS issues in development. The backend uses Node.js `--watch` mode for automatic restarts.

## First Login

1. Navigate to [http://localhost:5173](http://localhost:5173)
2. Click **Sign In**
3. Enter the admin credentials printed to your console during the seed step
4. You will land on the **Admin Dashboard**

**Immediately change your admin password:**
- Go to Admin → Users
- Click **Edit** on the admin account
- Set a strong password (8+ characters, uppercase, number, special character)

## Creating Stores and Users

Before uploading inventory data, you need stores and store manager accounts.

### Create a Store

1. Go to **Admin → Stores → + Add Store**
2. Enter a **Store Code** (must match the code in your Excel files exactly — case-sensitive)
3. Enter a **Store Name**
4. Click **Create Store**

Alternatively, stores are created automatically from the Store Code column when you upload an inventory file.

### Create a Store Manager

1. Go to **Admin → Users → + Add User**
2. Fill in:
   - **Employee ID** — unique identifier (e.g. `MGR2001`)
   - **Full Name**
   - **Password** — share securely with the manager
   - **Role** — `Store Manager`
   - **Assigned Store** — select from the dropdown
3. Click **Create User**

The store manager can now log in at the same URL and will see only their assigned store's data.

## Uploading Your First Inventory File

1. Go to **Admin → Upload**
2. Click **↓ Download Template** to get a correctly formatted example file
3. Fill in your inventory data:
   - **Plant / Store Code** — must match stores in the system
   - **Material / Item Code** — unique identifier per item
   - **Material Description / Item Name** — human-readable description
   - **System Stock** — the quantity the system expects (from your ERP/POS)
4. Set the **Inventory Date** (the date this count is for)
5. Optionally set a **Submission Deadline**
6. Click **Validate & Preview** to see a row-by-row validation summary
7. Review the preview (valid / warning / error rows are colour-coded)
8. Click **Confirm & Publish**

Store managers will immediately see their assigned items in their **Inventory Count** page.

## Useful Development Commands

```bash
# Apply new migrations during schema changes
cd server && npx prisma migrate dev --name <short-description>

# Generate Prisma client after schema changes
cd server && npx prisma generate

# Open Prisma Studio (visual DB browser)
cd server && npx prisma studio

# Clear all operational data but keep user accounts
npm run db:clear

# Full reset: drop all tables, re-migrate, re-seed
npm run db:reset

# Build the frontend for production
npm run build:client
```

## Troubleshooting

### `prisma generate` error on fresh install

The Prisma client is generated automatically as part of `npm install` (via the `postinstall` script in `server/package.json`). If you need to regenerate it manually:

```bash
cd server && npx prisma generate
```

Prisma generates its client into the root `node_modules` due to workspace hoisting. Always run from the `server/` directory.

### Slow first login after inactivity (Render free tier)

Render's free tier spins the server down after 15 minutes of inactivity. The first request after that can take 30–60 seconds while the server wakes up. The login page automatically retries once — you do not need to do anything. To prevent this entirely, set up [UptimeRobot](https://uptimerobot.com) to ping `/api/health` every 5 minutes.

### Port 5000 already in use

```bash
# Find and kill the process on macOS/Linux
lsof -ti:5000 | xargs kill

# On Windows
netstat -ano | findstr :5000
taskkill /PID <pid> /F
```

### `CLIENT_URL` CORS error in production

Set `CLIENT_URL` in `server/.env` to the exact origin of your deployed frontend — including the protocol and port if non-standard:
```env
CLIENT_URL=https://your-app.example.com
```

No trailing slash.


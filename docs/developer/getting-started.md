# Getting Started

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js | 22.0+ | LTS recommended |
| npm | 9.0+ | Comes with Node.js |
| PostgreSQL | 15.0+ | Or a managed service: Supabase, Neon, Railway |
| Git | Any | For cloning the repo |

## Clone & Install

```bash
git clone https://github.com/Sumant3086/KinGuard.git
cd KinGuard
npm install
```

This installs dependencies for the monorepo root, the `client/` workspace, and the `server/` workspace in one step.

## Environment Variables

All server configuration lives in `server/.env`. Copy the template:

```bash
cp .env.example server/.env
```

Then open `server/.env` and fill in each value.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string. For Supabase, use the **pooled** URL (port 6543) with `?pgbouncer=true`. | `postgresql://user:pass@host:6543/db?pgbouncer=true` |
| `DIRECT_URL` | Non-pooled URL. For Supabase, use the direct URL (port 5432). For local PostgreSQL, set the same as `DATABASE_URL`. | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret key for JWT tokens. Must be at least 32 characters. | (generate below) |
| `PORT` | Port the Express server listens on. | `5000` |
| `NODE_ENV` | Runtime environment. | `development` |
| `CLIENT_URL` | Frontend origin for CORS. Must match the actual URL exactly — no trailing slash. | `http://localhost:5173` |

### Optional Variables — Email Notifications

The system uses the **Brevo HTTP API** for sending emails, not SMTP. This works on all hosting platforms including Render's free tier where SMTP ports are blocked.

Leave `BREVO_API_KEY` blank to disable email notifications entirely. The system works fully without them.

| Variable | Description |
|----------|-------------|
| `BREVO_API_KEY` | API key from [brevo.com](https://brevo.com) — free plan gives 300 emails/day |
| `SMTP_FROM` | Sender display name and email, e.g. `KinMarché <noreply@kinmarche.com>` |
| `ADMIN_EMAIL` | Fallback admin email if no admin user has an email address set |

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

Creates a single administrator account. The credentials are printed to your console — copy them, then **change the password immediately** after your first login via Admin → Users.

### Inspect the Database (Optional)

To browse your database tables visually:

```bash
cd server && npx prisma studio
```

## Running in Development

Start both the API server and the React app with one command:

```bash
npm run dev
```

This starts the API server on port 5000 and the React dev server on port 5173 together. The Vite dev server automatically proxies all `/api/*` requests to the backend, so there are no CORS issues in development.

To start them separately:

```bash
npm run dev:server   # API only — restarts automatically on file changes
npm run dev:client   # React only
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## First Login

1. Go to [http://localhost:5173](http://localhost:5173)
2. Click **Sign In**
3. Enter the admin credentials printed during the seed step
4. You will land on the **Admin Dashboard**

Change your admin password immediately: go to Admin → Users → Edit → set a new password.

## Creating Stores and Users

Stores and manager accounts can be created two ways:

**Manually:**
- Go to Admin → Stores → Add Store
- Go to Admin → Users → Add User (select role: Store Manager, assign a store)

**Automatically from an uploaded file:**
- When you upload an inventory file, any store codes in the file that don't exist in the system are created automatically (up to 50 per upload — beyond that the file is rejected, since that many unknown codes usually means a wrong column)
- A placeholder manager account is also created for each, named `MGR<storeCode>`, inactive and pending your approval

Store codes are normalised to trimmed upper case on both paths, so `2001a` and `2001A` are the same store. Leading zeros and separators are significant: `02001`, `2001`, and `2001-A` are three different stores.

To provision accounts for plants that already exist but have no user, use the *plants without users* action on Admin → Users. It creates one account per plant with a generated temporary password shown **once** — copy them before leaving the page.

## Uploading Your First Inventory File

1. Go to **Admin → Upload**
2. Click **↓ Download Template** to get a correctly formatted example
3. Fill in your inventory data — Plant Code, Material Code, Material Description, System Stock. Headers are matched by name in any order and several aliases are accepted for each (see the admin guide for the full list); System Stock is optional and defaults to 0
4. Set the **Inventory Date** and optionally a **Submission Deadline**
5. Click **Validate & Preview** to see a row-by-row validation summary
6. Click **Confirm & Publish**

Store managers immediately see their assigned items and can begin their physical count.

## Useful Development Commands

```bash
# Apply new migrations during schema changes
cd server && npx prisma migrate dev --name describe-the-change

# Generate Prisma client after schema changes
cd server && npx prisma generate

# Open Prisma Studio (visual DB browser)
cd server && npx prisma studio

# Clear all operational data but keep user accounts
npm run db:clear

# Full reset: drop all tables, re-migrate, re-seed (destructive)
npm run db:reset

# Build the frontend for production
npm run build:client
```

## Checks Before You Push

There is no CI gate on this repository, so these four commands are the gate. Run all of them, from the repository root, before opening a pull request or pushing to `main`.

```bash
npm run lint --workspace=client   # ESLint 9 flat config
npm run lint --workspace=server   # ESLint 10 flat config
npm run test:unit                 # Vitest, server unit tests
npm run build:client              # Production Vite build
```

Both lint configs run with `--max-warnings 0`, so a warning fails the command just like an error. That is deliberate: a warning nobody has to fix is a warning everybody ignores.

Lint the workspaces separately, not with a single root command. They are on different major versions of ESLint with separate flat configs — the client config also carries the browser and service-worker globals that `client/public/sw.js` needs, and the server config carries the Node globals. A combined run would silently apply the wrong environment to one of them.

Finally, confirm the server still boots:

```bash
cd server && node -e "import('./src/app.js').then(() => console.log('boot ok'))"
```

Run that from `server/`, not from the root — `env.js` validates the required variables at import time and reads them from `server/.env`. From the root you will get `Missing required environment variable: DATABASE_URL` even on a perfectly good checkout.

If the boot fails with a Prisma client error after pulling schema changes, regenerate it: `cd server && npx prisma generate`.

## Troubleshooting

### Prisma generate error on fresh install

The Prisma client is generated automatically as part of `npm install` (via @prisma/client's postinstall script). If you need to regenerate it manually:

```bash
cd server && npx prisma generate
```

Always run from the `server/` directory — Prisma needs to find the schema at `server/prisma/schema.prisma`.

### Slow first login after inactivity (Render free tier)

Render's free tier spins down after 15 minutes of inactivity. The first request after that can take 30–60 seconds. The login page retries automatically — just wait. To prevent this entirely, set up [UptimeRobot](https://uptimerobot.com) to ping `/api/health` every 5 minutes.

### Port 5000 already in use

The server kills the port automatically on startup in development (via `server.js`). If it still fails:

```bash
# macOS / Linux
lsof -ti:5000 | xargs kill

# Windows
netstat -ano | findstr :5000
taskkill /PID <pid> /F
```

### CORS error in production

Set `CLIENT_URL` to the exact origin of your deployed frontend — include the protocol, no trailing slash:
```env
CLIENT_URL=https://your-app.example.com
```

Multiple origins are supported as a comma-separated list.

### `Missing required environment variable: DATABASE_URL` when the file clearly exists

You are running from the wrong directory. `server/src/config/env.js` validates on import and the `.env` it reads is `server/.env`. Run server-side commands from `server/`.

### `No workspaces found` from an npm workspace command

Run npm workspace commands from the repository root. A `cd` earlier in the same shell session is the usual cause.

### 429 responses during local testing

Two separate mechanisms produce a 429, and they clear differently. The per-IP login limiter (20 requests per 15 minutes) resets when the server restarts, because it is in process memory. The per-account lockout (10 consecutive wrong passwords, 15 minutes) is stored on the `User` row and survives a restart — clear `loginAttempts` and `lockedUntil` in Prisma Studio, or wait it out.

### Emails are not being sent

Email is optional and silently disabled when `BREVO_API_KEY` is unset — the app works fully without it. If the key is set and mail still is not arriving, check that the recipient user actually has an `email` value: users without one are skipped by every notification path, with no error.

Note that this uses Brevo's HTTP API rather than SMTP, so an SMTP connectivity test tells you nothing. Render's free tier blocks outbound SMTP ports, which is precisely why the HTTP API is used.

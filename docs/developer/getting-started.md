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

### Optional Variables — Error Reporting

Every 5xx is written to the server log. If you would rather find out about them somewhere
you already look, point `ERROR_WEBHOOK_URL` at anything that accepts a JSON POST — a
Slack incoming webhook, a collector of your own, a serverless function.

| Variable | Description |
|----------|-------------|
| `ERROR_WEBHOOK_URL` | Destination for fault reports. Unset means no reporting at all. |
| `ERROR_WEBHOOK_TOKEN` | Sent as `Authorization: Bearer <token>` if the destination needs authentication |

The payload carries the route, status, request id, user id, and the error's name, message
and first twelve stack frames. It never carries the request body, cookies, or headers —
this leaves the building, and an inventory upload or a session cookie must not leave with
it. Reports are deduplicated for five minutes per distinct fault and capped at thirty a
minute, so an outage produces a handful of messages rather than a flood; the count of
what was dropped rides along on the next report that gets through.

Nothing here can affect a response. The POST is never awaited, is bounded by a five
second timeout, and a sink that is down or refusing connections produces one warning line
in the log and nothing else.

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
3. Fill in your inventory data — Plant Code, Material Code, Material Description, System Stock. Headers are matched by name in any order and several aliases are accepted for each (see the admin guide for the full list); System Stock is optional and a blank cell stays blank for the store manager to fill in, while an explicit `0` is kept as a real figure of zero
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

GitHub Actions runs all of this on every push and pull request (`.github/workflows/ci.yml`), but a red build twenty minutes after you push is a slow way to find a missing semicolon. Run these from the repository root first.

```bash
npm run lint --workspace=client   # ESLint 9 flat config
npm run lint --workspace=server   # ESLint 10 flat config
npm run test:unit                 # Vitest, server unit tests (mocked, no database)
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

## Integration Tests

`npm run test:unit` mocks Prisma, so it can only check the JavaScript around a query — never the query. Roughly thirty raw SQL statements, every unique constraint, the `AuditLog` delete-blocking trigger, and the scheduler's single-winner lease are all invisible to it. `npm run test:integration` runs the real controllers against a real PostgreSQL database to cover exactly that gap.

These tests are destructive. Every file truncates every table before each test, so they need a throwaway database of their own — never the one in `server/.env`. `tests/integration/guard.js` enforces this: it loads `server/.env` the same way Prisma does and aborts the run if `DATABASE_URL` points anywhere other than localhost. Setting `ALLOW_DESTRUCTIVE_INTEGRATION_TESTS=yes` overrides it, and you should have a very specific reason before you do.

The quickest throwaway database is a container:

```bash
docker run -d --name kinguard-test-pg -p 55432:5432 \
  -e POSTGRES_USER=kinguard -e POSTGRES_PASSWORD=kinguard -e POSTGRES_DB=kinguard_test \
  postgres:16

export DATABASE_URL="postgresql://kinguard:kinguard@localhost:55432/kinguard_test"
export DIRECT_URL="$DATABASE_URL"

npm run migrate --workspace=server   # prisma migrate deploy
npm run test:integration
```

Delete it with `docker rm -f kinguard-test-pg` when you are done. CI does the same thing with a `postgres:16` service container.

Note the `migrate deploy` step. It applies the checked-in migration SQL exactly as production would, rather than reconciling against `schema.prisma` the way `migrate dev` does — so a schema change that was pushed to the live database without its migration being committed fails here instead of on someone else's fresh checkout. That is not hypothetical: the first run of this suite failed on a missing `BatchDeadlineExtension` table, and `20260731000001_align_migrations_with_schema` is the repair.

### Adding an integration test

Put it in `server/tests/integration/` with a `.int.test.js` suffix — the default `vitest.config.js` excludes that suffix, so integration tests never run in `npm test`. Import `resetDb` and the fixture builders from `./helpers.js` and call `resetDb()` in `beforeEach`.

Two things to know before writing assertions. `resetDb` uses `TRUNCATE ... RESTART IDENTITY`, which is the only way to empty `AuditLog` — a `BEFORE DELETE` trigger rejects every `DELETE` against that table, and `TRUNCATE` does not fire row triggers. And audit writes are fire-and-forget, so a test asserting on one needs the `waitForAuditLog` poller rather than a bare read.

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

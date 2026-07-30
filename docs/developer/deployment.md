# Deployment

## Render (current setup)

Single web service — the backend serves both the API and the built React frontend from the same process.

| Field | Value |
|---|---|
| Runtime | Node |
| Root Directory | *(leave empty)* |
| Build Command | `npm install && npm run build:client && npm run migrate` |
| Start Command | `node server/src/server.js` |
| Health Check Path | `/api/health` |

### Environment Variables on Render

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase pooled connection URL (port 6543, with `?pgbouncer=true`) |
| `DIRECT_URL` | Supabase direct connection URL (port 5432) |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `CLIENT_URL` | Your Render URL, e.g. `https://kinmarchae.onrender.com` |
| `BREVO_API_KEY` | Optional — Brevo API key for email notifications (free at brevo.com) |
| `SMTP_FROM` | Optional — sender name and email, e.g. `KinMarché <noreply@kinmarche.com>` |
| `ADMIN_EMAIL` | Optional — fallback email for admin notifications |

`PORT` is set automatically by Render — do not add it manually.

### Keep the server awake

Render's free tier sleeps after 15 minutes of inactivity. Set up [UptimeRobot](https://uptimerobot.com) (free) to ping `/api/health` every 5 minutes to prevent this.

### Region

Frankfurt (EU Central) gives good latency to DRC and Central Africa.

---

## Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database**
3. Copy the **Connection Pooling** URL as `DATABASE_URL` — append `?pgbouncer=true` if not already there
4. Copy the **Direct Connection** URL as `DIRECT_URL`

### Local PostgreSQL

```bash
sudo apt install postgresql-15
sudo -u postgres psql
CREATE USER kinmarche WITH PASSWORD 'yourpassword';
CREATE DATABASE kinmarche OWNER kinmarche;
\q
```

Set both `DATABASE_URL` and `DIRECT_URL` to `postgresql://kinmarche:yourpassword@localhost:5432/kinmarche`.

---

## VPS with PM2

```bash
git clone https://github.com/Sumant3086/KinGuard.git /opt/kinmarche
cd /opt/kinmarche
npm install
npm run build:client
npm run migrate
npm install -g pm2
pm2 start server/src/server.js --name kinmarche --interpreter node
pm2 save && pm2 startup
```

### Nginx config

```nginx
server {
    listen 80;
    server_name app.kinmarche.com;
    root /opt/kinmarche/client/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 15M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Add HTTPS: `sudo certbot --nginx -d app.kinmarche.com`

---

## Email Setup (Brevo)

The system uses the Brevo HTTP API — not SMTP. This works on Render's free tier where outbound SMTP ports (25/465/587) are blocked.

1. Sign up at [brevo.com](https://brevo.com) — the free plan allows 300 emails per day
2. Go to **SMTP & API → API Keys** and create a key
3. Add the key as `BREVO_API_KEY` in your environment variables
4. Set `SMTP_FROM` to your sender name and email address

If `BREVO_API_KEY` is not set, the system runs normally but no email notifications are sent.

---

## Deployment Checklist

**Before first deploy:**
- [ ] Client lint, server lint, unit tests, and the production client build all pass locally (see `getting-started.md`)
- [ ] Database created and migrations applied (`npm run migrate`)
- [ ] `JWT_SECRET` is at least 32 random characters, and is **not** the value from any other environment
- [ ] `DATABASE_URL` is the pooled URL and `DIRECT_URL` the direct one — migrations run over `DIRECT_URL`
- [ ] `CLIENT_URL` matches the exact frontend origin (no trailing slash; comma-separate multiple origins)
- [ ] `NODE_ENV=production` is set — this is what masks 5xx internal detail and enables HSTS
- [ ] Admin account seeded and password changed

**After deploy:**
- [ ] Login as admin works at the production URL
- [ ] `/api/health` returns `{ "status": "ok" }`
- [ ] An unknown `/api/...` path returns a JSON 404, not the SPA shell
- [ ] A deep link such as `/store/inventory` loads on a hard refresh, not a 404 — confirms SPA fallback
- [ ] Upload a test file and verify the cycle appears in store manager view
- [ ] Log in as a store manager and confirm store isolation (only their store visible)
- [ ] Confirm the store manager's Book Stock column is not editable — this is the core integrity guarantee and is worth verifying on the deployed build, not just in code review
- [ ] Log in as an area manager and confirm only assigned stores are listed
- [ ] If Brevo is configured, confirm a test email arrives
- [ ] Delete the test cycle and confirm it disappears from the store and area manager dashboards within a minute

**Ongoing:**
- [ ] Monitor `/api/health` with UptimeRobot or similar — it is exempt from rate limiting for exactly this
- [ ] Review audit logs via Admin → Activity Log
- [ ] Back up the PostgreSQL database regularly
- [ ] Run `npm run migrate` after pulling schema changes

## Operating Notes

**Schedulers run in the server process.** The reminder, escalation, and cycle-schedule services are intervals inside the Node process, not external cron. Running more than one instance of the API means running more than one copy of each scheduler, and duplicate reminder emails. If you scale horizontally, gate the schedulers to a single instance first.

**The response cache is per-instance.** `serverCache.js` is an in-memory Map. Two instances hold two independent caches, and an invalidation on one does not reach the other, so a write can appear to roll back for up to the TTL depending on which instance serves the next read. The TTLs are short (30 seconds to 5 minutes) and nothing correctness-critical depends on the cache, but it is a real source of confusing reports at more than one instance.

**PgBouncer drops idle connections.** Supabase's pooler closes idle connections, which surfaces as `P1001`/`P1002`/`P1008`/`P1017` from Prisma. The `withRetry` / `withDbRetry` helpers already retry these, and `server.js` keeps a periodic keep-alive ping. An occasional retried error in the logs is expected; a sustained run of them is not.

**Cold starts on free tiers.** Render's free tier spins down after 15 minutes idle and the first request afterwards can take 30–60 seconds. The login page retries automatically, and `/api/health` answers `503 { "status": "starting" }` rather than failing outright while the pool comes up. A 5-minute uptime ping avoids the problem entirely.

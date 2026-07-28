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
- [ ] Database created and migrations applied (`npm run migrate`)
- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] `CLIENT_URL` matches the exact frontend origin (no trailing slash)
- [ ] `NODE_ENV=production` is set
- [ ] Admin account seeded and password changed

**After deploy:**
- [ ] Login as admin works at the production URL
- [ ] `/api/health` returns `{ "status": "ok" }`
- [ ] Upload a test file and verify the cycle appears in store manager view
- [ ] Log in as a store manager and confirm store isolation (only their store visible)
- [ ] If Brevo is configured, confirm a test email arrives

**Ongoing:**
- [ ] Monitor `/api/health` with UptimeRobot or similar
- [ ] Review audit logs via Admin → Activity Log
- [ ] Back up the PostgreSQL database regularly
- [ ] Run `npm run migrate` after pulling schema changes

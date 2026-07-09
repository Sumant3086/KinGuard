# Deployment

> Production deployment guide for KinMarché — backend, frontend, and database.

---

## Table of Contents

- [Overview](#overview)
- [Infrastructure Choices](#infrastructure-choices)
- [Backend Deployment (Node.js / Express)](#backend-deployment-nodejs--express)
- [Frontend Deployment (React / Vite)](#frontend-deployment-react--vite)
- [Database (PostgreSQL)](#database-postgresql)
- [Environment Variables (Production)](#environment-variables-production)
- [Nginx Reverse Proxy](#nginx-reverse-proxy)
- [Process Manager (PM2)](#process-manager-pm2)
- [Health Check](#health-check)
- [Deployment Checklist](#deployment-checklist)

---

## Overview

KinMarché has two deployable units:

| Unit | Tech | Recommended host |
|------|------|-----------------|
| **API server** | Node.js 18 + Express | Railway · Render · VPS (Ubuntu) · AWS EC2 |
| **Frontend** | Static HTML/JS/CSS (Vite build) | Vercel · Netlify · Cloudflare Pages · Nginx |
| **Database** | PostgreSQL 15 | Supabase · Neon · Railway Postgres · AWS RDS |

The frontend calls the API via HTTP/JSON. In production they are often on different domains — configure `CLIENT_URL` in the server and CORS headers accordingly.

---

## Infrastructure Choices

### Recommended for small-medium deployments

| Component | Provider | Notes |
|-----------|----------|-------|
| API | **Railway** or **Render** | Zero-config Node.js deployment, free tier available |
| Frontend | **Vercel** or **Netlify** | Automatic deploys from GitHub, global CDN |
| Database | **Supabase** | Managed Postgres, built-in connection pooling, generous free tier |

### On-premises / VPS

Run everything on a single Ubuntu 22.04 LTS server with:
- Nginx as reverse proxy + static file server
- PM2 as Node.js process manager
- PostgreSQL installed locally

---

## Backend Deployment (Node.js / Express)

### Option A — Railway / Render / Fly.io

1. Connect your GitHub repository to the platform
2. Set the root directory to `/` (monorepo root) or `/server`
3. Set the build command: *(none — no build step for Node.js)*
4. Set the start command:
   ```bash
   npm run migrate && npm start --workspace=server
   ```
5. Add all required environment variables (see [Environment Variables](#environment-variables-production))
6. Deploy

### Option B — VPS with PM2

```bash
# On the server — clone the repo
git clone https://github.com/Sumant3086/KinGuard.git /opt/kinmarche
cd /opt/kinmarche

# Install all dependencies
npm run install:all

# Run database migrations
cd server && npx prisma generate && cd ..
npm run migrate

# Ensure admin account
npm run seed

# Install PM2 globally
npm install -g pm2

# Start the server with PM2
pm2 start server/src/server.js --name kinmarche-api --interpreter node
pm2 save
pm2 startup  # Follow the printed command to enable auto-start on reboot
```

---

## Frontend Deployment (React / Vite)

### Build

```bash
npm run build:client
```

Output goes to `client/dist/`. This directory contains static files that can be served by any web server or CDN.

### Option A — Vercel / Netlify / Cloudflare Pages

1. Connect your GitHub repository
2. Set the root directory to `client/`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Deploy

> **SPA routing:** Add a rewrite rule so all paths serve `index.html` (Vercel and Netlify do this automatically with a `_redirects` file or `vercel.json`).

**`client/public/_redirects`** (for Netlify):
```
/*  /index.html  200
```

**`client/vercel.json`** (for Vercel):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Option B — Nginx (VPS)

```nginx
server {
    listen 80;
    server_name app.kinmarche.com;

    root /opt/kinmarche/client/dist;
    index index.html;

    # SPA fallback — serve index.html for all non-file routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets for 1 year
    location ~* \.(js|css|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Database (PostgreSQL)

### Supabase (recommended)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database**
3. Copy:
   - **Connection pooling** URL → use as `DATABASE_URL`
   - **Direct connection** URL → use as `DIRECT_URL`
4. Run migrations from your local machine or CI:
   ```bash
   DATABASE_URL=<your-supabase-url> DIRECT_URL=<your-direct-url> npm run migrate
   ```

### Self-hosted PostgreSQL

```bash
# Ubuntu 22.04
sudo apt install postgresql-15

# Create database and user
sudo -u postgres psql
CREATE USER kinmarche WITH PASSWORD 'strong-password';
CREATE DATABASE kinmarche OWNER kinmarche;
\q

# Set DATABASE_URL
DATABASE_URL=postgresql://kinmarche:strong-password@localhost:5432/kinmarche
DIRECT_URL=postgresql://kinmarche:strong-password@localhost:5432/kinmarche
```

---

## Environment Variables (Production)

All variables go in `server/.env` (or as platform environment variables if using Railway/Render/etc.).

```env
# ── Database ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:5432/kinmarche?pgbouncer=true
DIRECT_URL=postgresql://user:pass@host:5432/kinmarche

# ── Auth ──────────────────────────────────────────────────────────────
JWT_SECRET=<32+ character random string — generate with openssl rand -base64 32>
JWT_EXPIRES_IN=8h

# ── Server ────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=production
CLIENT_URL=https://app.kinmarche.com

# ── Email (optional) ─────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@kinmarche.com
SMTP_PASS=<gmail-app-password>
SMTP_FROM=KinMarché <noreply@kinmarche.com>
```

> **Important:** `NODE_ENV=production` enables rate limiting and disables stack traces in error responses.

---

## Nginx Reverse Proxy

When hosting both the API and frontend on the same VPS, use Nginx to reverse-proxy API requests to Node.js and serve static files directly:

```nginx
server {
    listen 80;
    server_name app.kinmarche.com;

    # Serve the React SPA
    root /opt/kinmarche/client/dist;
    index index.html;

    # Proxy API requests to Node.js
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 15M;  # must be >= Multer's 10MB limit
    }

    # SPA fallback for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### HTTPS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d app.kinmarche.com
```

Certbot will automatically modify your Nginx config and set up auto-renewal.

---

## Process Manager (PM2)

PM2 keeps the Node.js server running and restarts it on crash or reboot.

```bash
# Start
pm2 start server/src/server.js \
  --name kinmarche-api \
  --interpreter node \
  --env production

# View logs
pm2 logs kinmarche-api

# Monitor
pm2 monit

# Reload (zero-downtime restart)
pm2 reload kinmarche-api

# Save process list (survives reboots)
pm2 save
pm2 startup
```

**`ecosystem.config.js`** (optional — place in repo root):
```js
module.exports = {
  apps: [{
    name: 'kinmarche-api',
    script: 'server/src/server.js',
    interpreter: 'node',
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
```

Then: `pm2 start ecosystem.config.js --env production`

---

## Health Check

The API exposes a health endpoint that does not require authentication:

```
GET /api/health
```

Response:
```json
{ "status": "ok", "timestamp": "2026-07-10T12:00:00.000Z" }
```

Use this with your load balancer, uptime monitor (Better Uptime, UptimeRobot), or container health check.

---

## Deployment Checklist

### Before first deploy

- [ ] PostgreSQL database created and accessible
- [ ] `server/.env` populated with all required variables
- [ ] `JWT_SECRET` is at least 32 characters and randomly generated
- [ ] `CLIENT_URL` matches the exact origin of the deployed frontend (no trailing slash)
- [ ] `NODE_ENV=production` is set
- [ ] `npm run migrate` has been run against the production database
- [ ] `npm run seed` has been run to create the admin account

### Security before going live

- [ ] Default admin password (`Admin@123`) has been changed
- [ ] `server/.env` is in `.gitignore` (already configured) — confirm it is not committed
- [ ] HTTPS is enabled (Let's Encrypt or platform TLS)
- [ ] `client_max_body_size` in Nginx is set to ≥15 MB (to allow 10 MB file uploads)

### After deploy

- [ ] Test login as admin at the production URL
- [ ] Upload a small test inventory file and verify stores receive it
- [ ] Log in as a store manager and verify store isolation
- [ ] Confirm the `/api/health` endpoint returns `200`
- [ ] Verify email notifications if SMTP is configured (upload a file and check inbox)

### Ongoing

- [ ] Monitor `/api/health` with an uptime service
- [ ] Review audit logs periodically via Admin → Activity Log
- [ ] Back up the PostgreSQL database regularly (daily recommended)
- [ ] Run `npm run migrate` after each deployment that includes schema changes

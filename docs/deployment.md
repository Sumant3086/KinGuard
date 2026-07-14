# Deployment

## Render (current setup)

Single web service - backend serves both the API and the built React frontend.

| Field | Value |
|---|---|
| Runtime | Node |
| Root Directory | *(empty)* |
| Build Command | `npm install --include=dev && npm run build --workspace=client && cd server && npx prisma generate && npx prisma migrate deploy && node prisma/seed.js` |
| Start Command | `npm start` |

Environment variables:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase pooled connection URL |
| `DIRECT_URL` | Supabase direct connection URL |
| `JWT_SECRET` | 32+ character random string |
| `CLIENT_URL` | Your Render URL e.g. `https://kinmarchae.onrender.com` |
| `SMTP_HOST` | `smtp.gmail.com` (optional) |
| `SMTP_PORT` | `587` (optional) |
| `SMTP_USER` | Gmail address (optional) |
| `SMTP_PASS` | Gmail App Password (optional) |
| `SMTP_FROM` | Display name and address (optional) |

`PORT` is set automatically by Render - do not add it manually.

Keep-alive: Render free tier sleeps after 15 minutes of inactivity. Use UptimeRobot (free) to ping `/api/health` every 5 minutes.

Region: Frankfurt (EU Central) for DRC/African users.

## Database

### Supabase

1. Create a project at supabase.com
2. Go to Settings -> Database
3. Copy the Connection Pooling URL as `DATABASE_URL` (add `?pgbouncer=true` at the end)
4. Copy the Direct Connection URL as `DIRECT_URL`

### Local PostgreSQL

```bash
sudo apt install postgresql-15
sudo -u postgres psql
CREATE USER kinmarche WITH PASSWORD 'yourpassword';
CREATE DATABASE kinmarche OWNER kinmarche;
\q
```

Set both `DATABASE_URL` and `DIRECT_URL` to `postgresql://kinmarche:yourpassword@localhost:5432/kinmarche`.

## VPS with PM2

```bash
git clone https://github.com/Sumant3086/KinGuard.git /opt/kinmarche
cd /opt/kinmarche
npm install --include=dev
npm run build --workspace=client
cd server && npx prisma generate && npx prisma migrate deploy && node prisma/seed.js && cd ..
npm install -g pm2
pm2 start server/src/server.js --name kinmarche --interpreter node
pm2 save && pm2 startup
```

Nginx config:

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

HTTPS: `sudo certbot --nginx -d app.kinmarche.com`

## Checklist

Before first deploy:
- [ ] Database created and migrations run
- [ ] `JWT_SECRET` is at least 32 random characters
- [ ] `CLIENT_URL` matches the exact frontend origin (no trailing slash)
- [ ] `NODE_ENV=production` is set
- [ ] Admin account seeded

After deploy:
- [ ] Login as admin works at the production URL
- [ ] `/api/health` returns `{ "status": "ok" }`
- [ ] Upload a test file and verify store managers receive it
- [ ] Log in as a store manager and confirm store isolation
- [ ] Default admin password changed

Ongoing:
- [ ] Monitor `/api/health` with an uptime service
- [ ] Review audit logs via Admin -> Activity Log
- [ ] Back up the PostgreSQL database regularly
- [ ] Run `npx prisma migrate deploy` after schema changes

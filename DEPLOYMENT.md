# KinGuard Deployment Guide

## Deploying to Render

### Prerequisites

1. Render account (https://render.com)
2. PostgreSQL database on Render
3. GitHub repository with KinGuard code

### Step 1: Create PostgreSQL Database

1. Go to Render Dashboard
2. Click "New +" → "PostgreSQL"
3. Choose a name (e.g., `kinguard-db`)
4. Select region and instance type
5. Click "Create Database"
6. Copy the **Internal Database URL** (for backend service)
7. Save the **External Database URL** (for local migrations)

### Step 2: Deploy Backend

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name:** `kinguard-api`
   - **Region:** Same as database
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy`
   - **Start Command:** `npm start`
   - **Instance Type:** Free or Starter

4. Add Environment Variables:
   ```
   DATABASE_URL=<internal-database-url-from-step-1>
   JWT_SECRET=<generate-strong-random-string-min-32-chars>
   JWT_EXPIRES_IN=8h
   PORT=5000
   NODE_ENV=production
   CLIENT_URL=<your-frontend-url-will-add-after-step-3>
   ```

5. Click "Create Web Service"

### Step 3: Deploy Frontend

1. Click "New +" → "Static Site"
2. Connect your GitHub repository
3. Configure:
   - **Name:** `kinguard-app`
   - **Branch:** `main`
   - **Root Directory:** `client`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`

4. Click "Create Static Site"

5. After deployment, copy the frontend URL

### Step 4: Update Backend Environment

1. Go back to your backend service (`kinguard-api`)
2. Go to "Environment"
3. Update `CLIENT_URL` with your frontend URL from Step 3
4. Save changes (this will redeploy the backend)

### Step 5: Create .env for Frontend API URL (Optional)

If you need to configure the API URL in the frontend:

1. In Render static site settings, add environment variable:
   ```
   VITE_API_URL=<your-backend-url>
   ```

2. Update `client/src/api/client.js`:
   ```javascript
   const client = axios.create({
     baseURL: import.meta.env.VITE_API_URL || '/api',
   });
   ```

### Step 6: Run Database Migrations

Option A: From local machine with external URL:
```bash
cd server
DATABASE_URL=<external-database-url> npx prisma migrate deploy
DATABASE_URL=<external-database-url> npm run seed
```

Option B: Using Render Shell:
1. Go to your backend service
2. Click "Shell"
3. Run:
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```

### Step 7: Verify Deployment

1. Visit your frontend URL
2. Try logging in with seed credentials:
   - Admin: `ADMIN001` / `Password123!`
   - Store Manager: `MGR2036` / `Password123!`
3. Check backend health: `<backend-url>/api/health`

### Important Security Notes

1. **Never commit secrets** to the repository
2. **Rotate JWT_SECRET** from default if you used one
3. **Change seed passwords** in production or remove seed entirely
4. **Use strong passwords** for all production accounts
5. **Enable Render's security features** (Auto-Deploy, Health Checks)

### Troubleshooting

**Database connection fails:**
- Verify DATABASE_URL uses the internal URL on Render
- Check database and backend are in the same region

**CORS errors:**
- Verify CLIENT_URL in backend matches your frontend URL exactly
- Check for trailing slashes

**Build fails:**
- Check build logs in Render dashboard
- Verify all dependencies are in package.json
- Ensure Node version compatibility

**Migrations fail:**
- Use external database URL for remote migrations
- Check database permissions
- Verify Prisma schema is valid

### Monitoring

1. Set up health check endpoint: `/api/health`
2. Enable Render's health check monitoring
3. Set up logging alerts in Render dashboard
4. Monitor database usage and connections

### Cost Optimization

- Use Render Free Tier for testing (service spins down after 15 min inactivity)
- Upgrade to Starter plan ($7/month) for production
- PostgreSQL Starter ($7/month) includes 1GB storage
- Monitor usage to avoid unexpected charges

### Backup Strategy

1. Render PostgreSQL includes automated backups on paid plans
2. For additional safety, set up manual backup cronjob:
   ```bash
   pg_dump $DATABASE_URL > backup.sql
   ```
3. Store backups in external storage (AWS S3, Google Cloud Storage)

### Continuous Deployment

Render automatically deploys when you push to the configured branch:

```bash
git add .
git commit -m "your changes"
git push origin main
```

Backend and frontend will redeploy automatically.

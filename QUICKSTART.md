# KinGuard Quick Start Guide

## ✅ What's Already Done

- ✅ Database created on Render
- ✅ Database migrations completed
- ✅ Seed data loaded (stores, users, sample inventory)
- ✅ Environment variables configured in `server/.env`
- ✅ Backend tested and working

## 🚀 Start the Application

### Option 1: Start Both Frontend and Backend

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

### Option 2: Using Root Commands

From the project root:

**Backend:**
```bash
npm run dev:server
```

**Frontend (in another terminal):**
```bash
npm run dev:client
```

## 🌐 Access the Application

Once both servers are running:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000
- **Health Check:** http://localhost:5000/api/health

## 🔐 Test Credentials

### Admin Account
- **Employee ID:** `ADMIN001`
- **Password:** `Password123!`
- **Can:** Manage stores, users, upload inventory, view all reports

### Store Manager Accounts

**Store 2036:**
- **Employee ID:** `MGR2036`
- **Password:** `Password123!`
- **Can:** View and verify Store 2036 inventory only

**Store 2007:**
- **Employee ID:** `MGR2007`
- **Password:** `Password123!`
- **Can:** View and verify Store 2007 inventory only

**Store 2024:**
- **Employee ID:** `MGR2024`
- **Password:** `Password123!`

**Store 2013:**
- **Employee ID:** `MGR2013`
- **Password:** `Password123!`

## 🧪 Test the Application

### 1. Test Admin Login
1. Go to http://localhost:5173
2. Click "Login"
3. Use ADMIN001 / Password123!
4. You should see the Admin Dashboard

### 2. Test Store Manager Login
1. Logout from Admin
2. Login with MGR2036 / Password123!
3. You should see Store 2036 Dashboard
4. Click "Inventory" to see store-specific records

### 3. Test Store Isolation
1. Login as MGR2036
2. View inventory - you'll only see Store 2036 items
3. Logout and login as MGR2007
4. View inventory - you'll only see Store 2007 items
5. ✅ This proves store-level data isolation works!

### 4. Test Admin Features
Login as ADMIN001 and try:
- ✅ View all stores (Admin → Stores)
- ✅ Create a new store
- ✅ Create a new store manager
- ✅ View all inventory across all stores
- ✅ Generate reconciliation reports

### 5. Test Store Manager Features
Login as MGR2036 and try:
- ✅ View dashboard with store statistics
- ✅ View inventory items for Store 2036
- ✅ Edit a record (enter physical quantity and remarks)
- ✅ Save draft
- ✅ Submit inventory
- ✅ Download store inventory

## 📁 Sample Data Included

The database has been seeded with:

- **4 Stores:** 2036, 2007, 2024, 2013
- **1 Admin:** ADMIN001
- **4 Store Managers:** One for each store
- **8 Inventory Records:** 2 items per store

## 🛠️ Development Commands

### Backend Commands (from `server/` directory)

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Run database migrations
npx prisma migrate dev

# Seed database
npm run seed

# Run tests
npm test

# View database in Prisma Studio
npx prisma studio
```

### Frontend Commands (from `client/` directory)

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔧 Common Issues

### Backend won't start

**Error:** `DATABASE_URL not found`
- **Fix:** Make sure `server/.env` file exists with DATABASE_URL

**Error:** `JWT_SECRET must be at least 32 characters`
- **Fix:** Check JWT_SECRET in `server/.env`

### Database connection fails

**Error:** `Can't reach database server`
- **Fix:** Check internet connection
- **Fix:** Verify DATABASE_URL in `server/.env` is correct
- **Fix:** Ensure Render database is running

### Frontend can't connect to backend

**Error:** `Network Error` or `401 Unauthorized`
- **Fix:** Make sure backend is running on port 5000
- **Fix:** Check that CORS is configured (should be automatic)
- **Fix:** Verify Vite proxy is working (check `client/vite.config.js`)

### Can't login

**Error:** `Employee ID or password is incorrect`
- **Fix:** Check you're using correct credentials (see above)
- **Fix:** Make sure database is seeded: `npm run seed`

## 📊 Testing File Upload (Admin Only)

1. Login as ADMIN001
2. Go to Admin → Upload
3. Create a sample CSV file:

```csv
Store Code,Material Code,Material Name,System Quantity
2036,MAT006,Widget F,150
2036,MAT007,Widget G,200
2007,MAT008,Widget H,100
```

4. Select inventory date
5. Upload the file
6. Check upload results

## 🎯 Next Steps

### For Development
1. Explore the codebase
2. Add new features
3. Run tests
4. Update documentation

### For Production Deployment
1. Read `DEPLOYMENT.md`
2. Read `SECURITY_CHECKLIST.md`
3. Set up Render services
4. Configure production environment variables
5. Deploy!

## 📚 Additional Resources

- **Full Documentation:** See `README.md`
- **Deployment Guide:** See `DEPLOYMENT.md`
- **Security Checklist:** See `SECURITY_CHECKLIST.md`
- **API Endpoints:** See `README.md` API section

## 💡 Tips

- Use **Prisma Studio** to view database: `npx prisma studio` (from `server/`)
- Check **backend logs** in the terminal for debugging
- Use **browser dev tools** (F12) to inspect network requests
- All passwords in development are `Password123!`
- Store Managers can only see their own store's data (this is enforced on the backend)

## 🎉 You're Ready!

The application is fully set up and ready to use. Start exploring and building!

---

**Need Help?**
- Check the console logs (browser and terminal)
- Review the error messages
- Check `SECURITY_CHECKLIST.md` for common issues
- Review code comments in the source files

# KinGuard

Loss & Prevention Inventory Reconciliation System

## Overview

KinGuard is a secure web application for managing inventory reconciliation across multiple retail stores. It allows administrators to upload master inventory files containing records for all stores, and enables store managers to verify physical quantities for their assigned store only.

## Features

**Admin Features:**
- Upload master inventory files (Excel/CSV)
- Manage stores and users
- View all inventory records across all stores
- Filter and search inventory data
- Generate and download reconciliation reports
- View audit logs
- Dashboard with key metrics

**Store Manager Features:**
- View inventory assigned to their store only
- Enter physical quantities and remarks
- Save drafts and continue later
- Submit completed inventory
- Download their store's inventory report
- Dashboard with store-specific statistics

## Architecture

**Frontend:**
- React 18 with Vite
- React Router for navigation
- Axios for API calls
- Context API for authentication state
- Responsive CSS

**Backend:**
- Node.js with Express
- JWT authentication with bcrypt
- Role-based access control (RBAC)
- Prisma ORM for PostgreSQL
- File upload with Multer
- Excel processing with ExcelJS
- CSV parsing
- Rate limiting on auth endpoints
- Helmet for security headers
- CORS protection

**Database:**
- PostgreSQL
- Stores, Users, UploadBatches, InventoryRecords, AuditLogs

## Technology Stack

- **Frontend:** React, Vite, JavaScript, React Router, Axios
- **Backend:** Node.js, Express, JavaScript
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT with bcrypt
- **File Processing:** Multer, ExcelJS, csv-parse
- **Validation:** Zod
- **Security:** Helmet, CORS, express-rate-limit
- **Testing:** Jest

## Folder Structure

```
KinGuard/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/           # API client functions
│   │   ├── components/    # Reusable components
│   │   ├── context/       # React Context (Auth)
│   │   ├── pages/         # Page components
│   │   ├── styles/        # CSS files
│   │   ├── App.jsx        # Main app component
│   │   └── main.jsx       # Entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                # Node.js backend
│   ├── src/
│   │   ├── config/        # Environment config
│   │   ├── controllers/   # Route controllers
│   │   ├── middleware/    # Auth & error handling
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── app.js         # Express app
│   │   └── server.js      # Server entry point
│   ├── prisma/
│   │   ├── schema.prisma  # Database schema
│   │   └── seed.js        # Seed data
│   ├── tests/             # Test files
│   └── package.json
│
├── .env.example           # Example environment variables
├── .gitignore
├── package.json           # Root workspace config
└── README.md
```

## Local Setup

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- npm or yarn

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd KinGuard
   ```

2. **Install dependencies:**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables:**
   
   Create a `.env` file in the `server` directory:
   ```bash
   cp .env.example server/.env
   ```

   Edit `server/.env` with your values:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/kinguard
   JWT_SECRET=your-super-secret-key-at-least-32-characters-long
   JWT_EXPIRES_IN=8h
   PORT=5000
   NODE_ENV=development
   CLIENT_URL=http://localhost:5173
   ```

4. **Create PostgreSQL database:**
   ```bash
   createdb kinguard
   ```

5. **Run database migrations:**
   ```bash
   cd server
   npx prisma migrate dev
   ```

6. **Seed the database:**
   ```bash
   npm run seed
   ```

   This creates:
   - 4 stores (2036, 2007, 2024, 2013)
   - 1 admin (ADMIN001 / Password123!)
   - 4 store managers (MGR2036, MGR2007, MGR2024, MGR2013 / Password123!)
   - Sample inventory records

7. **Start development servers:**

   In one terminal (backend):
   ```bash
   cd server
   npm run dev
   ```

   In another terminal (frontend):
   ```bash
   cd client
   npm run dev
   ```

8. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## Test Credentials

**Admin:**
- Employee ID: `ADMIN001`
- Password: `Password123!`

**Store Managers:**
- Store 2036: `MGR2036` / `Password123!`
- Store 2007: `MGR2007` / `Password123!`
- Store 2024: `MGR2024` / `Password123!`
- Store 2013: `MGR2013` / `Password123!`

**Note:** These are development credentials only. Never use these in production.

## Security Model

### Store-Level Data Isolation

The most critical security requirement is strict store-level data isolation for Store Managers.

**Backend Authorization:**
- Store Managers can only access records for their assigned store
- The backend derives store ownership from the authenticated JWT token
- Store code/ID is never trusted from client requests
- All inventory queries include store ID validation
- Cross-store access attempts return 404 (not 403) to prevent information disclosure

**Query Pattern:**
```javascript
// Store Manager record fetch
const records = await prisma.inventoryRecord.findMany({
  where: {
    storeId: req.user.storeId,  // From authenticated token
    id: requestedRecordId
  }
});
```

**What Store Managers Cannot Do:**
- View another store's records
- Update another store's records
- Download another store's data
- Access admin routes
- Change their assigned store

### Authentication

- JWT tokens stored in localStorage
- Tokens include userId, role, and storeId
- 8-hour token expiration
- bcrypt password hashing (10 rounds)
- Rate limiting on login (5 attempts per 15 minutes)

### Input Validation

- All user input validated before processing
- File upload restrictions (type, size)
- Parameterized database queries via Prisma
- Physical quantities validated (non-negative numbers)

### API Security

- Helmet for security headers
- CORS restricted to CLIENT_URL
- Authentication required on all protected routes
- Role-based authorization middleware
- Safe error messages (no stack traces in production)

## File Upload Format

Master inventory files must contain these columns (flexible header names supported):

| Required Column | Accepted Header Names |
|----------------|----------------------|
| Store Code | Store Code, StoreCode, Store, store_code |
| Material Code | Material Code, MaterialCode, Material, material_code, SKU |
| Material Name | Material Name, MaterialName, Description, material_name, Item Name |
| System Quantity | System Quantity, SystemQuantity, SYS, system_quantity, Quantity |

**Supported Formats:**
- Excel (.xlsx, .xls)
- CSV (.csv)

**Validation:**
- Store code must exist in the database
- System quantity must be non-negative
- All required fields must be present
- Rejected rows are logged with reasons

## Running Tests

```bash
cd server
npm test
```

Tests cover:
- Store 2036 manager can view Store 2036 records
- Store 2036 manager cannot view Store 2007 records
- Cross-store update protection
- Backend difference calculation
- Role separation

## Build Commands

**Frontend build:**
```bash
cd client
npm run build
```

**Backend (no build needed, runs directly):**
```bash
cd server
npm start
```

## Deployment

### Environment Variables for Production

Set these in your hosting environment:

```
DATABASE_URL=<postgresql-connection-string>
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_EXPIRES_IN=8h
PORT=5000
NODE_ENV=production
CLIENT_URL=<frontend-url>
```

### Database Migration

Run migrations before starting the server:
```bash
npm run migrate
```

### Health Endpoint

Check server health:
```
GET /api/health
```

Returns:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Store Manager
- `GET /api/store/dashboard` - Get dashboard stats
- `GET /api/store/inventory` - Get inventory records
- `PATCH /api/store/inventory/:id` - Update record
- `POST /api/store/inventory/submit` - Submit inventory
- `GET /api/store/inventory/download` - Download store inventory

### Admin
- `GET /api/admin/dashboard` - Get admin dashboard
- `GET /api/admin/stores` - List stores
- `POST /api/admin/stores` - Create store
- `PATCH /api/admin/stores/:id` - Update store
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PATCH /api/admin/users/:id` - Update user
- `POST /api/admin/uploads` - Upload inventory file
- `GET /api/admin/uploads` - List uploads
- `GET /api/admin/inventory` - Get inventory records
- `GET /api/admin/reports/reconciliation` - Get report data
- `GET /api/admin/reports/reconciliation/download` - Download report
- `GET /api/admin/audit-logs` - Get audit logs

## Inventory Calculation

The system calculates inventory differences as:

```
difference = physicalQuantity - systemQuantity
```

**Examples:**
- System: 100, Physical: 100 → Difference: 0 (Matched)
- System: 55, Physical: 12 → Difference: -43 (Shortage)
- System: 30, Physical: 35 → Difference: 5 (Excess)

The backend calculates and stores this value. The client displays it but never controls the calculation.

## Known Limitations

- PDF and Word files are not automatically parsed for inventory data. Use Excel or CSV.
- Post-submission editing is locked by default. Admins can reopen if needed (feature not implemented yet).
- Large file uploads (>10MB) are rejected.
- Report downloads limited to recent data for performance.

## Development Notes

**Seed Database:**
```bash
cd server
npm run seed
```

**Reset Database:**
```bash
cd server
npx prisma migrate reset
```

**Generate Prisma Client:**
```bash
cd server
npx prisma generate
```

**View Database:**
```bash
cd server
npx prisma studio
```

## Support

For issues or questions, contact the development team.

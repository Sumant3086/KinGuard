# Security

> Security model, threat controls, and operational checklist for KinMarché.

---

## Table of Contents

- [Security Model](#security-model)
- [Authentication](#authentication)
- [Authorisation & Role Separation](#authorisation--role-separation)
- [Store Isolation](#store-isolation)
- [Data Integrity](#data-integrity)
- [Transport Security](#transport-security)
- [HTTP Security Headers](#http-security-headers)
- [Rate Limiting](#rate-limiting)
- [File Upload Security](#file-upload-security)
- [SQL Injection Prevention](#sql-injection-prevention)
- [Audit Trail](#audit-trail)
- [Secrets Management](#secrets-management)
- [Operational Checklist](#operational-checklist)

---

## Security Model

KinMarché is an internal business application accessed by two trust levels:

| Role | Trust level | What they can access |
|------|------------|---------------------|
| `ADMIN` | High | All stores, all cycles, all data, system configuration |
| `STORE_MANAGER` | Medium | Their single assigned store only — enforced at the database query level |
| Unauthenticated | None | Only the login endpoint |

Every security control is applied server-side. The frontend is treated as untrusted — it can display data but never compute authoritative figures or bypass access rules.

---

## Authentication

### JWT Tokens

Tokens are signed with **HS256** using the `JWT_SECRET` environment variable (minimum 32 characters). Token payload:

```json
{
  "userId": 1,
  "role": "STORE_MANAGER",
  "storeId": 3,
  "iat": 1720000000,
  "exp": 1720028800
}
```

Tokens expire after **8 hours** by default (configurable via `JWT_EXPIRES_IN`).

**On every request:**
1. The `Authorization: Bearer <token>` header is verified with `jsonwebtoken.verify()`
2. Any JWT error (invalid, expired, tampered) immediately returns `401` — no fallthrough
3. The `userId` from the payload is looked up in the database — if the user is inactive or deleted, the request is rejected with `401`

### Password Hashing

Passwords are hashed with **bcrypt** at 10 rounds before storage. The raw password never exists in the database. The `passwordHash` field is never included in any API response.

### Cold-Start Retry

On the first request after server restart, Prisma may not have re-established its connection pool. `authController.login()` catches the initial DB error, calls `prisma.$connect()`, and retries once. This prevents false 503 errors on cold starts without compromising security.

---

## Authorisation & Role Separation

### Route-Level Guards

Applied via Express middleware chains in `adminRoutes.js` and `storeRoutes.js`:

```
/api/auth/*      →  (no guard)
/api/admin/*     →  authenticate() → requireRole('ADMIN')
/api/store/*     →  authenticate() → requireStoreManager()
                    (role = STORE_MANAGER AND storeId IS NOT NULL)
```

If the middleware chain fails at any point, the request is rejected before reaching the controller. Controllers do not re-check roles.

### Frontend Role Separation

React's `PrivateRoute` component redirects users who are authenticated but have the wrong role. However, this is a UI convenience — the backend enforces role restrictions independently and would reject cross-role API calls even if the frontend were bypassed.

---

## Store Isolation

This is the most critical security control in the system.

**Every store manager query explicitly filters by the manager's own store ID:**

```javascript
// storeController.js — example
const records = await prisma.inventoryRecord.findMany({
  where: {
    storeId: req.user.storeId,  // ← always from the JWT, never from req.query
    batchId: parseInt(batchId),
  }
});
```

`req.user.storeId` comes from the validated JWT, not from the request body or URL. There is no path through the code where a store manager can specify a different `storeId` in a request and have it honoured.

**The same pattern applies to:**
- `getInventory` — filters by `storeId: req.user.storeId`
- `updateInventoryRecord` — verifies ownership with `{ id: recordId, storeId }` before updating
- `submitInventory` — only updates records where `storeId = req.user.storeId`
- `downloadInventory` — only exports records for `req.user.storeId`
- `getDashboard` — aggregates only `storeId = req.user.storeId`

---

## Data Integrity

### Server-Side Variance Calculation

The `difference` (Variance) field is **always calculated server-side** in `updateInventoryRecord`:

```javascript
difference = parseFloat((effectivePhysQty - finalSysQty).toFixed(4));
```

The client cannot send a `difference` value and have it accepted. Even if a client sends a manipulated request, the server recalculates from the stored quantities.

### Submission Validation (Transactional)

`submitInventory` runs inside a Prisma `$transaction`. Before marking any record as SUBMITTED, it validates:

1. All pending records have a `physicalQuantity` (no blanks)
2. All discrepant records have a `shrinkageCategory`
3. All discrepant records have non-empty `remarks`

If any validation fails, the transaction rolls back and nothing is committed. These same checks run client-side for UX, but the server validation is authoritative.

### Duplicate Protection

`InventoryRecord` has a unique constraint on `(batchId, storeId, materialCode)`. Re-uploading the same file is idempotent — `createMany({ skipDuplicates: true })` prevents duplicate rows.

---

## Transport Security

In production, all traffic must run over **HTTPS**. Configure this via:

- **Managed platforms** (Railway, Vercel, Netlify): TLS is automatic
- **VPS**: Use [Let's Encrypt](https://letsencrypt.org/) with `certbot --nginx`

The server does not redirect HTTP to HTTPS — this is the responsibility of the reverse proxy (Nginx) or platform.

---

## HTTP Security Headers

Applied by **Helmet** on every response:

| Header | Value set by Helmet | Protection |
|--------|-------------------|-----------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `X-Frame-Options` | `SAMEORIGIN` | Prevents clickjacking |
| `X-XSS-Protection` | `0` | Disables legacy XSS filter (modern browsers handle this) |
| `Referrer-Policy` | `no-referrer` | Prevents referrer leakage |
| `Content-Security-Policy` | Helmet defaults | Restricts resource loading sources |
| `Strict-Transport-Security` | `max-age=15552000` | Forces HTTPS for 180 days |

---

## Rate Limiting

Applied via `express-rate-limit` at route mount time in `app.js`:

| Limiter | Applied to | Limit | Window | Response on limit |
|---------|-----------|-------|--------|-------------------|
| `authLimiter` | `POST /auth/login` | 10 requests | 15 minutes | `429` — "Too many login attempts. Please wait 15 minutes." |
| `apiLimiter` | `/api/admin/*`, `/api/store/*` | 300 requests | 1 minute | `429` — "Too many requests. Please slow down." |

**Rate limiting is skipped when `NODE_ENV=development`** to avoid friction during local development.

### Why these limits?

- **10 / 15 min on auth:** A brute-force attack trying common passwords would take hundreds of attempts. At 10/15min, it would take days to try 1000 passwords for a single account, by which time alerting should have triggered.
- **300 / min on API:** A legitimate user navigating the admin dashboard generates ≈10–20 requests/minute. 300/min gives 15x headroom for bursts while blocking automated scrapers.

---

## File Upload Security

File uploads are handled by **Multer** with:

1. **Memory storage** — files are never written to disk; they live in a `Buffer` for the duration of the request
2. **MIME type whitelist** — only `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, and `text/csv` are accepted; other types are rejected with `400` before any parsing occurs
3. **10 MB size cap** — enforced by Multer before the file reaches the controller

The JSON body parser is capped at `1 MB` to prevent DoS via oversized JSON payloads.

---

## SQL Injection Prevention

All database queries use **Prisma's parameterised query interface**. User input is never interpolated into query strings.

For the few endpoints that use `prisma.$queryRaw` (dashboard aggregations), Prisma uses tagged template literals which automatically parameterise values:

```javascript
// Safe — value is parameterised, not interpolated
const stats = await prisma.$queryRaw`
  SELECT COUNT(*)::int FROM "InventoryRecord"
  WHERE "storeId" = ${storeId} AND "batchId" = ${batchId}
`;
```

---

## Audit Trail

Every significant action writes an `AuditLog` entry with:
- `userId` — who performed the action
- `action` — what was done (enum string)
- `entityType` and `entityId` — what was affected
- `metadata` — action-specific context (before/after values, counts)
- `createdAt` — when it happened

Audit logs are **never deleted** by normal application operations. They are only cleared by `npm run db:reset` (a destructive development utility that drops all tables).

The audit log is accessible to admins via **Admin → Activity Log** and can be exported to Excel.

---

## Secrets Management

| Secret | Location | Notes |
|--------|----------|-------|
| `JWT_SECRET` | `server/.env` | Never hardcode. Minimum 32 characters. Rotate if compromised. |
| `DATABASE_URL` | `server/.env` | Contains DB credentials. Never commit. |
| `SMTP_PASS` | `server/.env` | Use an App Password for Gmail, not your account password. |
| Admin password | Database (bcrypt hash) | Change from `Admin@123` immediately after first deploy. |

`server/.env` is listed in `.gitignore`. Verify it is never tracked:

```bash
git status server/.env       # should show nothing
git log -- server/.env       # should show no commits
```

If secrets are accidentally committed, they must be rotated — rewriting git history removes the text but the secrets may already be captured by GitHub's secret scanning or cached by anyone who cloned the repo.

---

## Operational Checklist

### Before production launch

- [ ] `JWT_SECRET` is random and ≥32 characters
- [ ] Default admin password (`Admin@123`) changed
- [ ] `server/.env` is NOT committed to version control
- [ ] HTTPS is enabled on the production domain
- [ ] `NODE_ENV=production` is set (enables rate limiting, disables stack traces)
- [ ] Database is not publicly accessible without credentials
- [ ] Database backups are configured

### Ongoing

- [ ] Review Admin → Activity Log for unexpected actions (failed logins, unusual exports)
- [ ] Rotate `JWT_SECRET` and force re-login of all users if a token leak is suspected
- [ ] Keep Node.js, npm packages, and PostgreSQL updated — run `npm audit` monthly
- [ ] Revoke or deactivate accounts for employees who have left the organisation
- [ ] Review store assignments — ensure each store manager is assigned to exactly one store

### On suspected compromise

1. Rotate `JWT_SECRET` immediately — this invalidates all active sessions
2. Change all admin passwords
3. Review the audit log for the time window of the suspected compromise
4. Check for unauthorised store/user creation, file uploads, or data exports
5. If database credentials are compromised, rotate them and update `DATABASE_URL` in `.env`

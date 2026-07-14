# Security

## Access Control

Two roles exist in the system. Access is enforced server-side on every request — the frontend cannot bypass it.

| Role | Access |
|---|---|
| ADMIN | All stores, all cycles, all data, system configuration |
| STORE_MANAGER | Their single assigned store only, enforced at the database query level |
| Unauthenticated | Login endpoint only |

## Authentication

Tokens are signed with HS256 using `JWT_SECRET` (minimum 32 characters). Token payload:

```json
{
  "userId": 1,
  "role": "STORE_MANAGER",
  "storeId": 3,
  "iat": 1720000000,
  "exp": 1720028800
}
```

Tokens expire after 8 hours by default (`JWT_EXPIRES_IN`). A refresh token (7-day lifetime, stored in the database) is issued alongside the access token and rotated on each use.

On every request:
1. The JWT is verified with `jsonwebtoken.verify()`
2. Any JWT error returns 401 immediately
3. The `userId` is looked up in the database — if inactive or deleted, the request is rejected

Passwords are hashed with bcrypt at 10 rounds. The `passwordHash` field is never included in any API response.

## Route Guards

```
/api/auth/*    ->  no auth required
/api/admin/*   ->  authenticate() -> requireRole('ADMIN')
/api/store/*   ->  authenticate() -> requireStoreManager()
                   (role = STORE_MANAGER AND storeId IS NOT NULL)
```

If the middleware chain fails at any point, the request is rejected before reaching the controller.

## Store Isolation

Every store manager query filters by `storeId: req.user.storeId` from the validated JWT — never from the request body or URL. There is no path through the code where a store manager can specify a different `storeId` and have it honoured.

This applies to: `getInventory`, `updateInventoryRecord`, `submitInventory`, `downloadInventory`, `getDashboard`, `getNotifications`.

## Data Integrity

**Server-side variance calculation** — the `difference` field is always calculated server-side as `physicalQuantity - systemQuantity`. The client cannot send a `difference` value and have it accepted.

**Transactional submission** — `submitInventory` runs inside a Prisma `$transaction`. Before marking any record as SUBMITTED, it validates that all pending records have a physical quantity, all discrepant records have a shrinkage category, and all discrepant records have non-empty remarks. If any check fails, the transaction rolls back.

**Duplicate protection** — `InventoryRecord` has a unique constraint on `(batchId, storeId, materialCode)`. Re-uploading the same file is idempotent via `createMany({ skipDuplicates: true })`.

## HTTP Security Headers

Applied by Helmet on every response:

| Header | Protection |
|---|---|
| `X-Content-Type-Options: nosniff` | Prevents MIME sniffing |
| `X-Frame-Options: SAMEORIGIN` | Prevents clickjacking |
| `Referrer-Policy: no-referrer` | Prevents referrer leakage |
| `Strict-Transport-Security: max-age=15552000` | Forces HTTPS for 180 days |

`contentSecurityPolicy` is disabled because the React frontend uses inline styles and scripts.

## DoS Mitigation

| Control | Enforced by |
|---|---|
| JSON body capped at 1 MB | `express.json({ limit: '1mb' })` |
| File upload capped at 10 MB | Multer `limits.fileSize` |
| Export row limit 10,000 rows | Controller guard before DB fetch, returns 413 |
| Password length capped at 128 chars | `validatePassword()` before bcrypt |
| All IDs and pagination params validated | `parseId()` / `parsePageSize()` helpers, returns 400 |

Application-level rate limiting is not applied. Add it at the reverse proxy or Cloudflare level for production.

## File Upload Security

- Files are stored in memory (Buffer) only — never written to disk
- MIME type and file extension whitelist: `.xlsx`, `.xls`, `.csv`
- `application/octet-stream` is accepted only when the file extension is already validated
- 10 MB cap enforced by Multer before any parsing occurs

## SQL Injection Prevention

All queries use Prisma's parameterised interface. For the few endpoints using `prisma.$queryRaw`, Prisma uses tagged template literals which automatically parameterise values:

```js
// value is parameterised, not string-interpolated
await prisma.$queryRaw`
  SELECT COUNT(*)::int FROM "InventoryRecord"
  WHERE "storeId" = ${storeId} AND "batchId" = ${batchId}
`;
```

## Audit Trail

Every significant action writes an `AuditLog` entry: who, what, what entity, context metadata, and timestamp. Audit logs are never deleted by normal application operations.

## Secrets

| Secret | Location | Notes |
|---|---|---|
| `JWT_SECRET` | Environment variable | Min 32 chars. Rotate if compromised. |
| `DATABASE_URL` | Environment variable | Contains DB credentials. Never commit. |
| `SMTP_PASS` | Environment variable | Use a Gmail App Password, not your account password. |
| Admin password | Database (bcrypt hash) | Change from the seeded default after first deploy. |

`server/.env` is in `.gitignore`. Verify it was never committed:

```bash
git status server/.env      # should show nothing
git log -- server/.env      # should show no commits
```

## Operational Checklist

Before going live:
- [ ] `JWT_SECRET` is random and at least 32 characters
- [ ] Default admin password changed
- [ ] `server/.env` is not committed to version control
- [ ] HTTPS is enabled on the production domain
- [ ] `NODE_ENV=production` is set
- [ ] Database is not publicly accessible without credentials
- [ ] Database backups are configured

Ongoing:
- [ ] Review Admin -> Activity Log for unexpected actions
- [ ] Rotate `JWT_SECRET` and force re-login if a token leak is suspected
- [ ] Run `npm audit` monthly and update packages
- [ ] Deactivate accounts for employees who have left
- [ ] Ensure each store manager is assigned to exactly one store

If compromised:
1. Rotate `JWT_SECRET` immediately — invalidates all active sessions
2. Change all admin passwords
3. Review the audit log for the time window of the suspected compromise
4. Check for unauthorised store/user creation, file uploads, or data exports
5. If database credentials are exposed, rotate them and update `DATABASE_URL`

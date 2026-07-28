# Security

## Access Control

Three roles exist. Access is enforced server-side on every request — the frontend cannot bypass it.

| Role | Access |
|---|---|
| ADMIN | All stores, all cycles, all data, system configuration |
| AREA_MANAGER | Only the stores assigned to them (`Store.areaManagerId`), read + review only |
| STORE_MANAGER | Their single assigned store only, enforced at the database query level |
| Unauthenticated | `/api/auth/*` only |

## Authentication

Tokens are signed with HS256 using `JWT_SECRET` (minimum 32 characters, enforced at startup). Access token payload:

```json
{
  "userId": 1,
  "iat": 1720000000,
  "exp": 1720000900
}
```

- **Access token** — 15 minutes, hardcoded (`ACCESS_TTL_MS` in `authController.js`). Not configurable; this is a deliberate design choice, not an oversight — a short-lived access token limits the blast radius of a leaked token, while the refresh token carries the actual session.
- **Refresh token** — 7 days (`REFRESH_TTL_MS`), a random opaque string stored server-side in the `RefreshToken` table (not just a signed JWT, so it can be revoked). Rotated on every use: `POST /api/auth/refresh` deletes the presented token and issues a new one, so a stolen refresh token stops working the moment the legitimate client refreshes again.
- Both tokens are delivered as `httpOnly` cookies (`secure` in production, `sameSite: Strict` in production / `Lax` in development) — never exposed to client-side JavaScript, so an XSS payload cannot exfiltrate them via `document.cookie`.

On every authenticated request:
1. The access token is read from the cookie (or an `Authorization: Bearer` header, for non-browser clients)
2. It's verified with `jsonwebtoken.verify()` — any JWT error returns 401 immediately
3. The `userId` is resolved to a user record (via a 30-second in-memory cache, or the database on a cache miss) — inactive users are rejected with 401

**Login lockout** — after 10 failed login attempts for the same account within a 15-minute window, the account is locked for 15 minutes (`loginAttempts` / `lockedUntil` on `User`, checked and updated in `authController.js`). This is database-backed, not in-process memory, so it survives server restarts and applies consistently across multiple server instances. A constant-time dummy bcrypt comparison runs even when the employee ID doesn't exist, so login timing doesn't reveal whether an account exists.

Passwords are hashed with bcrypt at cost factor 10. `validatePassword()` (`authController.js`) requires 8–128 characters with at least one uppercase letter, one lowercase letter, and one digit — enforced on both self-service password changes and admin-created accounts. The `passwordHash` field is never included in any API response.

## Route Guards

```
/api/auth/*      ->  no auth required (rate-limited — see below)
/api/admin/*     ->  authenticate() -> requireRole('ADMIN')
/api/am/*        ->  authenticate() -> requireAreaManager()
/api/store/*     ->  authenticate() -> requireStoreManager()
                     (role = STORE_MANAGER AND storeId IS NOT NULL)
```

If the middleware chain fails at any point, the request is rejected before reaching the controller.

## Store / Scope Isolation

Every store manager query filters by `storeId: req.user.storeId` from the validated access token — never from the request body or URL. Every area manager query filters by stores where `areaManagerId` matches the token's `userId`. There is no path through the code where a store manager or area manager can supply a different ID and have it honoured.

## Data Integrity

**Server-side variance calculation** — the `difference` field is always calculated server-side as `physicalQuantity - systemQuantity`. The client cannot send a `difference` value and have it accepted.

**Transactional submission** — `submitInventory` runs inside a Prisma `$transaction`. Before marking any record as SUBMITTED, it validates that all pending records have a physical quantity, all discrepant records have a shrinkage category from the canonical 9-category list, and all discrepant records have non-empty remarks. If any check fails, the transaction rolls back.

**Duplicate protection** — `InventoryRecord` has a unique constraint on `(batchId, storeId, materialCode)`. Re-uploading the same file is idempotent via `createMany({ skipDuplicates: true })`.

## HTTP Security Headers

Applied by Helmet on every response, including a Content Security Policy:

| Header | Protection |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`; scripts must be same-origin files (no inline eval); styles allow `'unsafe-inline'` (React inline styles); `object-src 'none'`, `frame-ancestors 'none'` |
| `X-Content-Type-Options: nosniff` | Prevents MIME sniffing |
| `Strict-Transport-Security` | Forces HTTPS in production |

CORS is restricted in production to the origin(s) listed in `CLIENT_URL` (comma-separated); all other origins receive no CORS headers, so the browser blocks the response client-side.

## Rate Limiting

Applied via `express-rate-limit`:

| Scope | Limit |
|---|---|
| `/api/auth/*` (login, refresh) | 20 requests / 15 minutes / IP |
| Heavy export & analytics endpoints | 30 requests / minute / IP |

On top of this, the database-backed login lockout (above) rate-limits guessing attempts against a single account regardless of source IP.

## DoS Mitigation

| Control | Enforced by |
|---|---|
| JSON body capped at 1 MB | `express.json({ limit: '1mb' })` |
| File upload capped at 10 MB | Multer `limits.fileSize` |
| Export row limit 10,000 rows | Controller guard before DB fetch, returns 413 with guidance to narrow filters |
| Password length capped at 128 chars | Checked before bcrypt, so an attacker can't force expensive hashing of huge inputs |
| All IDs and pagination params validated | Rejects malformed input with 400 before it reaches a query |

## File Upload Security

- Files are held in memory (Buffer) only during processing — never written to disk
- Extension whitelist: `.xlsx`, `.xls`, `.csv`
- 10 MB cap enforced by Multer before any parsing occurs

## SQL Injection Prevention

All queries use Prisma's parameterised interface. The dashboard, analytics, and reporting endpoints that use `prisma.$queryRaw` do so with tagged template literals, which parameterise interpolated values automatically:

```js
// value is parameterised, not string-interpolated
await prisma.$queryRaw`
  SELECT COUNT(*)::int FROM "InventoryRecord"
  WHERE "storeId" = ${storeId} AND "batchId" = ${batchId}
`;
```

## Audit Trail

Every significant action writes an `AuditLog` entry: who, what, what entity, context metadata, and timestamp. There is no update or delete code path for this table anywhere in the application — entries are append-only and survive the deletion of the user who created them (the FK is nulled, not cascaded).

## Secrets

| Secret | Location | Notes |
|---|---|---|
| `JWT_SECRET` | Environment variable | Min 32 chars, enforced at startup. Rotate if compromised — this invalidates every active access token. |
| `DATABASE_URL` / `DIRECT_URL` | Environment variable | Contains DB credentials. Never commit. |
| `BREVO_API_KEY` | Environment variable | Email is sent via the Brevo HTTP API, not SMTP — there is no SMTP password anywhere in this system. |
| Admin password | Database (bcrypt hash) | Change from the seeded default immediately after first deploy. |

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
- [ ] Ensure each store manager is assigned to exactly one store, and each area manager's assigned stores are current

If compromised:
1. Rotate `JWT_SECRET` immediately — invalidates all active access tokens (refresh tokens still need step 2)
2. Delete affected users' `RefreshToken` rows (or all of them) to force full re-login
3. Change all admin passwords
4. Review the audit log for the time window of the suspected compromise
5. Check for unauthorised store/user creation, file uploads, or data exports
6. If database credentials are exposed, rotate them and update `DATABASE_URL`

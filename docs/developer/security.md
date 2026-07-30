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

**Book stock is immutable after upload.** `InventoryRecord.systemQuantity` is written by exactly one code path — the admin upload pipeline — and by no other endpoint in the application. Not the store update, not the area manager edit, not the admin single or bulk override. Correcting it requires re-uploading the cycle.

Treat this as a security control rather than a data-modelling preference. The product exists to quantify the gap between what the books say and what is on the shelf. A store manager who can edit book stock can make their own shrinkage disappear; an area manager who can edit it can do the same for a store they are meant to be policing; an admin who can edit it silently destroys the evidentiary value of every historical cycle. The absence of a write path is the control. Any change that adds one — including a well-intentioned "admin can fix typos" feature — removes it.

When reviewing a diff that touches `InventoryRecord`, check for `systemQuantity` in the write set of any handler. It should never appear outside the upload controller.

**Server-side variance calculation** — the `difference` field is always calculated server-side as `physicalQuantity - systemQuantity`. The client cannot send a `difference` value and have it accepted. This holds for all three roles: the store's count entry, the area manager's correction, and both admin override paths all recompute it from the stored system quantity.

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

Applied via `express-rate-limit`, in `app.js`:

| Scope | Limit | Why this number |
|---|---|---|
| `POST /api/auth/login` | 20 requests / 15 min / IP | Tight — this is the endpoint worth guessing against |
| Rest of `/api/auth` (refresh, logout, me) | 600 requests / 15 min / IP | Deliberately loose, see below |
| Heavy export & analytics endpoints | 30 requests / minute / IP | Each one is an expensive query or a document render |

**Do not tighten the second row to match the first.** An entire store network typically sits behind a single NAT'd office IP. Every open tab silently refreshes its access token every 15 minutes, so a dozen managers counting stock generate a steady stream of `/api/auth/refresh` calls from one apparent address. A 20-request limit there logs the whole branch out mid-count and looks exactly like an outage. The limit that actually protects against credential guessing is the login-specific one plus the account lockout — not a blanket cap on the auth prefix.

Both limiters key on IP, which is why neither is the primary defence. The database-backed login lockout (above) is: it targets the account rather than the source, so it holds across a rotating IP pool and across server instances.

`/api/health` is deliberately exempt from all rate limiting so an uptime probe can never be throttled into reporting a false outage.

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

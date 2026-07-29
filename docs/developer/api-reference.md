# API Reference

## Authentication

KinMarche uses **HttpOnly cookies** for authentication — not Authorization headers. This means:

- No token is returned in the login response body. The browser receives two cookies automatically: `accessToken` (15 min) and `refreshToken` (7 days).
- Every subsequent request sends these cookies automatically. No manual header management needed.
- On 401, the browser client silently exchanges the refresh token for a new access token, then retries the original request.

API clients that cannot use cookies (e.g. Postman, scripts) can alternatively pass the access token in an `Authorization: Bearer <token>` header.

## Error Format

All error responses use this JSON shape:

```json
{ "error": "Human-readable error message" }
```

In development mode, a `stack` field is also included.

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request — missing or invalid fields |
| `401` | Unauthenticated — missing, expired, or invalid session |
| `403` | Forbidden — valid session but insufficient role |
| `404` | Resource not found |
| `409` | Conflict — duplicate record |
| `413` | Result set too large — narrow your filters |
| `429` | Too many failed login attempts — account temporarily locked |
| `503` | Database temporarily unavailable — retry in a moment |

---

## Auth Endpoints

### `POST /api/auth/login`

Authenticate a user. Sets `accessToken` and `refreshToken` HttpOnly cookies.

**No authentication required.**

**Request body:**
```json
{ "employeeId": "EMP001", "password": "YourPassword1" }
```

**Success `200`:**
```json
{
  "user": {
    "id": 1,
    "employeeId": "EMP001",
    "name": "System Administrator",
    "email": "admin@example.com",
    "role": "ADMIN",
    "storeId": null,
    "store": null,
    "mustChangePassword": false
  }
}
```

For `STORE_MANAGER` users, `store` is populated:
```json
{ "store": { "id": 3, "storeCode": "2003", "storeName": "Kinshasa CBD" } }
```

**Error `401`:** Incorrect credentials. After 10 failures, the account is locked for 15 minutes (`429`).

### `POST /api/auth/refresh`

Exchange the refresh token cookie for a new access token. Called automatically by the browser client — you normally do not need to call this directly.

**Success `200`:** Returns the same `user` shape as login, with new cookies set.

### `POST /api/auth/logout`

Revokes the refresh token and clears both cookies.

**Success `200`:** `{ "message": "Logged out" }`

### `GET /api/auth/me`

Returns the currently authenticated user's profile.

**Requires:** Valid session (any role).

**Success `200`:** Same `user` shape as login.

### `POST /api/auth/change-password`

Change the current user's password. Also revokes all existing sessions so other devices are logged out.

**Requires:** Valid session (any role).

**Request body:**
```json
{ "currentPassword": "OldPassword1", "newPassword": "NewPassword1" }
```

**Password rules:** min 8 characters, at least one uppercase, one lowercase, one number.

### `PATCH /api/auth/profile`

Update the current user's name, email, or phone.

**Requires:** Valid session (any role).

**Request body:** (all fields optional)
```json
{ "name": "John Smith", "email": "john@example.com", "phone": "+243812345678" }
```

---

## Admin Endpoints

All admin endpoints require a valid session with role `ADMIN`.

### Dashboard & Notifications

#### `GET /api/admin/dashboard`

Network overview for the most recent completed cycle. Cached server-side for 5 minutes.

**Success `200`:**
```json
{
  "totalStores": 5,
  "currentBatch": {
    "id": 12,
    "inventoryDate": "2026-07-08T00:00:00.000Z",
    "submissionDeadline": "2026-07-10T23:59:00.000Z",
    "storesPending": 2,
    "storesSubmitted": 3,
    "overdueStores": ["Lubumbashi North"],
    "isDeadlinePassed": false
  },
  "storeScorecard": [{ "storeId": 1, "storeCode": "2001", "storeName": "Kinshasa CBD", "shortageRate": 7, "riskLevel": "YELLOW", "status": "SUBMITTED" }],
  "hotspots": [{ "storeCode": "2001", "materialCode": "1000013986", "materialName": "Whisky Black Label", "batchCount": 3, "totalShortage": 42 }],
  "networkSummary": { "totalRecords": 600, "matchedItems": 510, "shortageItems": 60, "excessItems": 30 }
}
```

#### `GET /api/admin/notifications`

Up to 5 actionable notifications for the latest cycle (overdue stores, deadline approaching, AM approvals waiting).

---

### Stores

#### `GET /api/admin/stores`

All stores with record counts. Cached 3 minutes.

#### `POST /api/admin/stores`

Create a store. Body: `{ "storeCode": "2006", "storeName": "Mbuji-Mayi" }`

#### `PATCH /api/admin/stores/:id`

Update store name or active status.

#### `DELETE /api/admin/stores/:id`

Delete a store. Blocked if the store has inventory records — deactivate instead.

#### `DELETE /api/admin/stores/:id/force`

Force-delete a store and cascade-delete all its inventory data.

#### `DELETE /api/admin/stores/bulk`

Bulk delete. Body: `{ "ids": [1, 2, 3], "force": false }`

#### `PATCH /api/admin/stores/:storeId/assign-am`

Assign or remove an area manager. Body: `{ "areaManagerId": 5 }` (null to remove).

---

### Users

#### `GET /api/admin/users`

All users (id, name, role, store, email, phone, status). Cached 2 minutes.

#### `POST /api/admin/users`

Create a user. Body: `{ "employeeId": "MGR2001", "name": "Alice", "password": "Pass1234!", "role": "STORE_MANAGER", "storeId": 3 }`

Valid roles: `ADMIN`, `AREA_MANAGER`, `STORE_MANAGER`.

#### `PATCH /api/admin/users/:id`

Update a user's name, password, store assignment, or active status.

#### `DELETE /api/admin/users/:id`

Delete a user. Cannot delete the last active admin.

#### `POST /api/admin/users/:id/approve`

Activate a pending user account. Generates a temporary password and sets `mustChangePassword: true`.

**Success `200`:** Returns user fields plus `tempPassword` (only returned once — share securely with the user).

#### `POST /api/admin/users/:id/reject`

Delete a pending user without activating them.

#### `POST /api/admin/users/bulk-review`

Approve or reject multiple pending users. Body: `{ "action": "approve", "userIds": [1, 2, 3] }`

#### `POST /api/admin/users/bulk-delete`

Delete multiple users. Body: `{ "userIds": [4, 5] }`

#### `POST /api/admin/users/batch-import/preview`

Upload a file (multipart) and preview what would be imported. No DB writes.

#### `POST /api/admin/users/batch-import/commit`

Upload a file and create pending users for admin approval.

---

### Inventory Cycles (Batches)

#### `GET /api/admin/batches`

All cycles with per-cycle statistics. Cached 1 minute.

#### `POST /api/admin/uploads`

Upload an inventory file to start a new cycle. Multipart form with fields:
- `file` — Excel (.xlsx/.xls) or CSV
- `inventoryDate` — ISO date string
- `submissionDeadline` — ISO datetime (optional)

Returns `409` with `warning: "duplicate_batch"` if a cycle exists within 3 days of the given date. Add `?force=true` to override.

#### `POST /api/admin/uploads/preview`

Parse and validate a file without creating a cycle. Returns up to 100 preview rows plus full-file error/warning counts.

#### `GET /api/admin/uploads/template`

Download a formatted Excel template with sample rows and a shrinkage reference sheet.

#### `PATCH /api/admin/batches/:id`

Update the submission deadline. Body: `{ "submissionDeadline": "2026-07-15T23:59:00Z" }`

#### `POST /api/admin/batches/:id/close`

Close a cycle immediately (sets deadline to now). Returns pending and submitted counts.

#### `DELETE /api/admin/batches/:id`

Soft-delete a cycle. The data is preserved and can be recovered — the cycle is simply hidden from all views.

#### `POST /api/admin/batches/extend`

Grant a per-store deadline extension. Body: `{ "batchId": 12, "storeId": 3, "newDeadline": "2026-07-12T23:59:00Z", "note": "Manager was on leave" }`

#### `POST /api/admin/batches/:id/unlock-store`

Reset a store's submission back to pending (for recount). Body: `{ "storeId": 3 }`

#### `POST /api/admin/batches/:id/send-reminders`

Send email reminders to all store managers who have not yet submitted.

#### `GET /api/admin/batches/:batchId/export`

Download a batch as Excel.

#### `GET /api/admin/batches/:batchId/export-pdf`

Download a batch as PDF.

---

### Inventory Records

#### `GET /api/admin/inventory`

Paginated cross-store inventory view.

Query params: `storeId`, `batchId`, `status` (PENDING/SUBMITTED), `discrepancy` (shortage/excess/matched), `search`, `page`, `pageSize` (max 200).

#### `PATCH /api/admin/inventory/:id/override`

Admin override of any record's physical count, remarks, category, or status.

#### `GET /api/admin/inventory/export`

Download filtered inventory as Excel. Returns `413` if result exceeds 10,000 records.

#### `GET /api/admin/inventory/export-pdf`

Download filtered inventory as PDF. Same 10,000 record limit.

---

### Reports

#### `GET /api/admin/reports/reconciliation`

Filtered reconciliation data as JSON. Same filters as inventory export.

#### `GET /api/admin/reports/reconciliation/download`

Download as Excel.

#### `GET /api/admin/reports/reconciliation/download-pdf`

Download as PDF.

#### `GET /api/admin/reports/executive-summary`

One-page executive summary PDF for the latest cycle. Includes network KPIs, top 5 risk stores, top 5 shrinkage categories, and comparison with the prior cycle.

---

### Analytics

#### `GET /api/admin/analytics/trends`

Shortage rate per store per cycle. Query: `?cycles=6` (max 12).

#### `GET /api/admin/analytics/trends-yoy`

Year-over-year comparison. Query: `?compareYear=2025&cycles=6`

Returns current-period rates and comparison-year rates side by side.

#### `GET /api/admin/analytics/risk`

Store risk scores (0–100) with peer percentile ranks, plus top 10 at-risk SKUs. Query: `?cycles=6`

Risk score = shortage rate × 40% + repeat rate × 25% + category severity × 25% + trend direction × 10%.

---

### Audit Logs

#### `GET /api/admin/audit-logs`

Recent audit log entries. Query: `?action=LOGIN&limit=100` (max 500). `action` must be a known action type.

#### `GET /api/admin/audit-logs/export`

Download audit log as Excel. Query: `?limit=2000` (max 5000).

---

### Scheduled Cycles

#### `GET /api/admin/schedules`

All recurring cycle schedules.

#### `POST /api/admin/schedules`

Create a schedule. Body:
```json
{
  "name": "Monthly Cycle",
  "frequency": "monthly",
  "dayOfMonth": 1,
  "submissionWindowDays": 7
}
```

Valid frequencies: `weekly` (use `dayOfWeek` 0–6), `monthly`, `quarterly` (use `dayOfMonth` 1–28).

#### `PATCH /api/admin/schedules/:id`

Update a schedule. Same fields as create, plus `isActive: boolean` to pause/resume.

#### `DELETE /api/admin/schedules/:id`

Delete a schedule.

---

### Area Manager Management (Admin)

#### `GET /api/admin/area-managers`

All active area managers with their assigned stores.

#### `PATCH /api/admin/area-managers/:amId/stores`

Batch-assign multiple stores to one area manager. Body: `{ "storeIds": [1, 2, 3] }` (max 100).

---

## Area Manager Endpoints

All area manager endpoints require a valid session with role `AREA_MANAGER`.

### `GET /api/am/dashboard`

Summary dashboard: count of assigned stores, how many have submitted, how many are pending review, how many have been approved or returned. Includes per-store progress breakdown.

### `GET /api/am/notifications`

Actionable notifications — stores waiting for review, upcoming deadline warnings.

### `GET /api/am/batches`

All inventory cycles that have records for this AM's stores, with per-cycle review status counts.

### `GET /api/am/batches/:batchId/stores`

Summary of each store in a given cycle — submitted count, pending count, review status.

### `GET /api/am/batches/:batchId/stores/:storeId/records`

Full inventory records for one store in one cycle, plus the AM review record.

### `PATCH /api/am/records/:id`

Edit a single inventory record before approving. Only works on submitted records for assigned stores. Creates an audit log entry.

Body (all optional): `{ "physicalQuantity": 10, "remarks": "Corrected after recount", "shrinkageCategory": "Miscount" }`

### `POST /api/am/batches/:batchId/stores/:storeId/approve`

Approve a store's submission. All records must be submitted. Notifies admins by email.

Body (optional): `{ "remarks": "Looks correct" }`

### `POST /api/am/batches/:batchId/stores/:storeId/return`

Return a store's submission for recount. Resets all submitted records back to pending and clears physical counts so the store starts fresh.

Body (required): `{ "remarks": "Please recount whisky aisle — quantities look off" }`

---

## Store Manager Endpoints

All store manager endpoints require a valid session with role `STORE_MANAGER`.

### `GET /api/store/dashboard`

Dashboard summary for the manager's store — latest cycle info, submission stats, older pending cycles.

### `GET /api/store/batches`

All inventory cycles that contain records for this store.

### `GET /api/store/inventory`

Paginated inventory records for this store. Query: `?batchId=12&search=whisky&status=PENDING&page=1&pageSize=100`

Response also includes `isLocked` (deadline passed), and `returnedByAM` (message if AM sent it back).

### `PATCH /api/store/inventory/:id`

Update a single record's physical count, system quantity, remarks, or shrinkage category. Auto-calculates variance. Blocked if the batch deadline has passed or the record is submitted.

### `POST /api/store/inventory/submit`

Submit all pending records for the active cycle. Validates that:
- All records have a physical count
- All discrepant records have a category selected
- All discrepant records have an issue detail entered

Body: `{ "batchId": 12 }`

### `GET /api/store/inventory/download`

Download this store's inventory as Excel. Query: `?batchId=12`

### `GET /api/store/notifications`

Actionable notifications for this store — new cycles, deadline warnings, AM return messages.

---

## Health Check

### `GET /api/health`

Returns server and database status.

**Success `200`:** `{ "status": "ok", "timestamp": "2026-07-27T10:00:00.000Z" }`

**DB unavailable `503`:** `{ "status": "starting", "timestamp": "..." }`

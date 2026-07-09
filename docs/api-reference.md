# API Reference

> Complete REST API documentation for KinMarché.  
> Base URL: `http://localhost:5000/api` (development) or your production API origin.

---

## Table of Contents

- [Authentication](#authentication)
- [Rate Limits](#rate-limits)
- [Error Format](#error-format)
- [Auth Endpoints](#auth-endpoints)
- [Admin Endpoints](#admin-endpoints)
  - [Dashboard & Notifications](#dashboard--notifications)
  - [Stores](#stores)
  - [Users](#users)
  - [File Upload](#file-upload)
  - [Inventory](#inventory)
  - [Reports](#reports)
  - [Cycles (Batches)](#cycles-batches)
  - [Analytics](#analytics)
  - [Audit Log](#audit-log)
- [Store Manager Endpoints](#store-manager-endpoints)

---

## Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Tokens are obtained from `POST /auth/login`. They expire after `8h` by default (configurable via `JWT_EXPIRES_IN`).

---

## Rate Limits

| Scope | Limit | Window | Applies to |
|-------|-------|--------|-----------|
| Auth | 10 requests | 15 minutes | `POST /auth/login` |
| API | 300 requests | 1 minute | All other endpoints |

When a limit is exceeded the server returns `429 Too Many Requests` with the error body:

```json
{ "error": "Too many login attempts. Please wait 15 minutes and try again." }
```

Rate limiting is disabled when `NODE_ENV=development`.

---

## Error Format

All error responses use a consistent JSON body:

```json
{
  "error": "Human-readable error message"
}
```

In development mode, a `stack` field is also included.

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request — missing or invalid fields |
| `401` | Unauthenticated — missing, expired, or invalid token |
| `403` | Forbidden — valid token but insufficient role |
| `404` | Resource not found |
| `409` | Conflict — duplicate record (e.g., duplicate store code) |
| `429` | Too many requests |
| `500` | Internal server error |
| `503` | Service temporarily unavailable (DB cold-start) |

---

## Auth Endpoints

### `POST /auth/login`

Authenticate a user and receive a JWT token.

**No authentication required.**

**Request body:**
```json
{
  "employeeId": "ADMIN001",
  "password": "Admin@123"
}
```

**Success response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "employeeId": "ADMIN001",
    "name": "System Administrator",
    "role": "ADMIN",
    "storeId": null,
    "store": null
  }
}
```

For `STORE_MANAGER` users the `store` field is populated:
```json
{
  "store": {
    "id": 3,
    "storeCode": "2003",
    "storeName": "Kinshasa CBD"
  }
}
```

---

### `GET /auth/me`

Returns the profile of the currently authenticated user.

**Requires:** Valid Bearer token (any role).

**Success response `200`:**
```json
{
  "id": 1,
  "employeeId": "ADMIN001",
  "name": "System Administrator",
  "role": "ADMIN",
  "storeId": null,
  "store": null
}
```

---

## Admin Endpoints

All admin endpoints require `Authorization: Bearer <token>` with role `ADMIN`.

---

### Dashboard & Notifications

#### `GET /admin/dashboard`

Returns the network overview for the most recent completed inventory cycle.

Response is cached server-side for 30 seconds.

**Success response `200`:**
```json
{
  "totalStores": 5,
  "currentBatch": {
    "id": 12,
    "inventoryDate": "2026-07-08T00:00:00.000Z",
    "submissionDeadline": "2026-07-10T23:59:00.000Z",
    "storesPending": 2,
    "storesSubmitted": 3,
    "overdueStores": [],
    "isDeadlinePassed": false
  },
  "storeScorecard": [
    {
      "storeId": 1,
      "storeCode": "2001",
      "storeName": "Kinshasa CBD",
      "totalItems": 120,
      "shortageCount": 8,
      "shortageRate": 7,
      "matchedCount": 100,
      "excessCount": 12,
      "topRemark": "Dented due to warehouse handling error",
      "status": "SUBMITTED",
      "isOverdue": false,
      "riskLevel": "YELLOW"
    }
  ],
  "hotspots": [
    {
      "storeCode": "2001",
      "storeName": "Kinshasa CBD",
      "materialCode": "1000013986",
      "materialName": "Whisky Black Label 750Ml",
      "batchCount": 3,
      "totalShortage": 42.0,
      "dominantRemark": "Pilferage suspected during transit"
    }
  ],
  "networkSummary": {
    "totalRecords": 600,
    "matchedItems": 510,
    "shortageItems": 60,
    "excessItems": 30
  }
}
```

**`riskLevel` values:** `RED` (≥20% shortage rate) · `YELLOW` (5–19%) · `GREEN` (<5%)  
**`status` values:** `SUBMITTED` · `PENDING` · `NO_DATA`

---

#### `GET /admin/notifications`

Returns real-time notification items computed from current data. Never cached.

**Success response `200`:**
```json
{
  "items": [
    {
      "type": "submitted",
      "message": "3 stores submitted counts in the last 24h",
      "batchId": 12,
      "urgent": false
    },
    {
      "type": "deadline",
      "message": "2 stores pending — 8 Jul deadline in 6h",
      "batchId": 12,
      "urgent": true
    }
  ],
  "count": 2
}
```

**`type` values:** `submitted` · `deadline` · `overdue`

---

### Stores

#### `GET /admin/stores`

List all stores (active and inactive), ordered by store code.

**Success response `200`:** Array of store objects:
```json
[
  {
    "id": 1,
    "storeCode": "2001",
    "storeName": "Kinshasa CBD",
    "isActive": true,
    "createdAt": "2026-07-01T10:00:00.000Z",
    "_count": {
      "users": 1,
      "inventoryRecords": 480
    }
  }
]
```

---

#### `POST /admin/stores`

Create a new store.

**Request body:**
```json
{
  "storeCode": "2006",
  "storeName": "Lubumbashi North",
  "isActive": true
}
```

**Success response `201`:** The created store object.

**Error `409`:** Store code already exists.

---

#### `PATCH /admin/stores/:id`

Update a store's name or active status.

**Request body** (all fields optional):
```json
{
  "storeName": "Lubumbashi North Branch",
  "isActive": false
}
```

**Success response `200`:** The updated store object.  
**Error `404`:** Store not found.

---

#### `DELETE /admin/stores/:id`

Delete a store. Fails if the store has inventory records.

**Success response `200`:**
```json
{ "message": "Store deleted" }
```

**Error `409`:** Store has inventory records — deactivate it instead.

---

#### `DELETE /admin/stores/:id/force`

Force-delete a store and cascade-delete all its inventory records. Use with caution.

**Success response `200`:**
```json
{ "message": "Store and all its data permanently deleted" }
```

---

#### `DELETE /admin/stores/bulk`

Bulk delete stores.

**Request body:**
```json
{
  "ids": [3, 4, 5],
  "force": false
}
```

With `force: false`, stores with inventory records are skipped.  
With `force: true`, all records for those stores are cascade-deleted.

**Success response `200`:**
```json
{
  "deleted": 2,
  "blocked": 1,
  "message": "Deleted 2 store(s). 1 skipped (have records — use force delete)."
}
```

---

#### `GET /admin/stores/:storeId/drilldown`

Shortage details for one store in a specific batch.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `batchId` | No | Defaults to the most recent batch |

**Success response `200`:** Array of shortage records:
```json
[
  {
    "id": 101,
    "materialCode": "1000013986",
    "materialName": "Whisky Black Label 750Ml",
    "systemQuantity": 50,
    "physicalQuantity": 42,
    "difference": -8,
    "remarks": "Pilferage suspected during transit",
    "shrinkageCategory": "In Transit"
  }
]
```

---

### Users

#### `GET /admin/users`

List all users ordered by employee ID.

**Success response `200`:** Array of user objects (without `passwordHash`):
```json
[
  {
    "id": 2,
    "employeeId": "MGR2001",
    "name": "John Mwamba",
    "role": "STORE_MANAGER",
    "storeId": 1,
    "isActive": true,
    "email": "john@kinmarche.com",
    "phone": "+243812345678",
    "store": {
      "id": 1,
      "storeCode": "2001",
      "storeName": "Kinshasa CBD"
    }
  }
]
```

---

#### `POST /admin/users`

Create a new user.

**Request body:**
```json
{
  "employeeId": "MGR2006",
  "name": "Alice Kabongo",
  "password": "SecurePass@1",
  "role": "STORE_MANAGER",
  "storeId": 6,
  "email": "alice@kinmarche.com",
  "phone": "+243823456789",
  "isActive": true
}
```

**Rules:**
- `role` must be `ADMIN` or `STORE_MANAGER`
- `storeId` is required when `role = STORE_MANAGER`
- `storeId` must be absent (or `null`) when `role = ADMIN`
- `password` must be at least 8 characters

**Success response `201`:** The created user object (without `passwordHash`).  
**Error `409`:** Employee ID already exists.

---

#### `PATCH /admin/users/:id`

Update a user. All fields are optional.

**Request body:**
```json
{
  "name": "Alice Kabongo-Mutombo",
  "password": "NewSecurePass@2",
  "storeId": 7,
  "isActive": true,
  "email": "alice.new@kinmarche.com",
  "phone": "+243823456789"
}
```

**Rules:**
- An `ADMIN` user cannot be assigned a store
- Omit `password` to leave it unchanged
- Set `storeId: null` to unassign a store manager from their store

**Success response `200`:** The updated user object.

---

#### `DELETE /admin/users/:id`

Delete a user. Cannot delete your own account. Cannot delete the last admin.

Reassigns non-nullable references (upload batches, deadline extensions) to the deleting admin before deletion.

**Success response `200`:**
```json
{ "message": "User deleted" }
```

---

### File Upload

#### `GET /admin/uploads/template`

Download a sample Excel template with correct column headers and example rows.

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
**Filename:** `KinGuard_InventoryTemplate.xlsx`

---

#### `POST /admin/uploads/preview`

Validate a file without committing any data. Returns a row-by-row preview.

**Content-Type:** `multipart/form-data`

**Form fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | `.xlsx`, `.xls`, or `.csv` — max 10 MB |
| `inventoryDate` | Yes | `YYYY-MM-DD` — the date this count is for |

**Success response `200`:**
```json
{
  "fileName": "inventory_july.xlsx",
  "inventoryDate": "2026-07-08",
  "totalRows": 250,
  "previewRows": 100,
  "showingPartial": true,
  "statistics": {
    "valid": 240,
    "warnings": 8,
    "errors": 2
  },
  "preview": [
    {
      "row": 2,
      "storeCode": "2001",
      "storeName": "Kinshasa CBD",
      "materialCode": "1000013986",
      "materialName": "Whisky Black Label 750Ml",
      "systemQuantity": 50,
      "status": "valid",
      "message": "OK"
    },
    {
      "row": 3,
      "storeCode": "2099",
      "storeName": "(new) 2099",
      "materialCode": "1000099999",
      "materialName": "Unknown Item",
      "systemQuantity": "0",
      "status": "warning",
      "message": "New store will be created: 2099"
    }
  ]
}
```

**Row `status` values:** `valid` · `warning` · `error`

---

#### `POST /admin/uploads`

Commit an upload — create the inventory cycle and distribute records to stores.

Add `?force=true` to the URL to override the duplicate-date warning.

**Content-Type:** `multipart/form-data`

**Form fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `file` | Yes | `.xlsx`, `.xls`, or `.csv` — max 10 MB |
| `inventoryDate` | Yes | `YYYY-MM-DD` |
| `submissionDeadline` | No | `YYYY-MM-DD` |

**Success response `201`:**
```json
{
  "batchId": 13,
  "totalRows": 250,
  "successfulRows": 246,
  "rejectedRows": 4,
  "errors": [
    { "row": 45, "error": "Missing Material Code" }
  ]
}
```

**Error `409`** (without `?force=true`):
```json
{
  "warning": "duplicate_batch",
  "message": "A batch already exists for 08/07/2026. Send with ?force=true to proceed anyway.",
  "existingBatch": { "id": 12, "inventoryDate": "2026-07-08T00:00:00.000Z", "fileName": "inventory_july.xlsx" }
}
```

**Accepted column name aliases:**

| Field | Accepted names |
|-------|---------------|
| Store Code | `Plant`, `Plant Code`, `Store Code`, `StoreCode`, `store_code`, `STORE CODE`, `PLANT` |
| Item Code | `Material`, `Material Code`, `MaterialCode`, `material_code`, `SKU`, `MATERIAL` |
| Item Name | `Material Description`, `Material Name`, `Description`, `material_name` |
| System Stock | `System Stock`, `System  Stock`, `SYS`, `System Quantity`, `QTY` |
| Remarks | `Remarks`, `remarks`, `Remark`, `Note` |

---

#### `GET /admin/uploads`

Upload history, ordered by upload date descending.

**Success response `200`:** Array of batch objects with uploader name.

---

### Inventory

#### `GET /admin/inventory`

Paginated inventory records across all stores and cycles.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `storeId` | int | Filter by store ID |
| `batchId` | int | Filter by batch/cycle ID |
| `status` | string | `PENDING` or `SUBMITTED` |
| `discrepancy` | string | `shortage`, `excess`, or `matched` |
| `search` | string | Search item code or item name |
| `page` | int | Page number (default: `1`) |
| `pageSize` | int | Records per page (default: `50`) |

**Success response `200`:**
```json
{
  "data": [
    {
      "id": 1001,
      "batchId": 12,
      "storeId": 1,
      "materialCode": "1000013986",
      "materialName": "Whisky Black Label 750Ml",
      "systemQuantity": 50,
      "physicalQuantity": 42,
      "difference": -8,
      "remarks": "Pilferage suspected during transit",
      "shrinkageCategory": "In Transit",
      "status": "SUBMITTED",
      "submittedAt": "2026-07-09T14:22:00.000Z",
      "store": { "storeCode": "2001", "storeName": "Kinshasa CBD" },
      "isRepeat": true
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalRecords": 246,
    "totalPages": 5
  }
}
```

**`isRepeat: true`** means this (store, item) combination had a shortage in a previous cycle.

---

#### `GET /admin/inventory/export`

Download filtered inventory as Excel. Accepts the same query params as `GET /admin/inventory` (no pagination).

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /admin/inventory/export-pdf`

Download filtered inventory as PDF.

**Response:** `application/pdf`

---

#### `PATCH /admin/inventory/:id/override`

Admin override for a single inventory record — change physical qty, remarks, category, or status.

**Request body** (all fields optional):
```json
{
  "physicalQuantity": 45,
  "remarks": "Corrected after recount",
  "shrinkageCategory": "Damage",
  "status": "SUBMITTED"
}
```

**Rules:**
- Setting `status: "SUBMITTED"` requires a non-null `physicalQuantity`
- Setting `status: "PENDING"` resets physical qty, difference, submittedBy, submittedAt, and shrinkage category to null

**Success response `200`:** The updated inventory record.

---

### Reports

#### `GET /admin/reports/reconciliation`

Full reconciliation report — all inventory records matching the filters.

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `storeId` | int | Filter by store |
| `status` | string | `PENDING` or `SUBMITTED` |
| `discrepancy` | string | `shortage`, `excess`, or `matched` |
| `includeInactive` | string | `true` to include inactive stores |

**Success response `200`:** Array of inventory records with store, batch, and submitter details.

---

#### `GET /admin/reports/reconciliation/download`

Download the reconciliation report as Excel. Accepts the same query params.

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /admin/reports/reconciliation/download-pdf`

Download the reconciliation report as PDF. Accepts the same query params.

**Response:** `application/pdf`

---

### Cycles (Batches)

#### `GET /admin/batches`

All inventory cycles with per-store submission statistics.

**Success response `200`:**
```json
[
  {
    "id": 12,
    "originalFileName": "inventory_july.xlsx",
    "inventoryDate": "2026-07-08T00:00:00.000Z",
    "submissionDeadline": "2026-07-10T23:59:00.000Z",
    "status": "COMPLETED",
    "uploader": { "name": "System Administrator", "employeeId": "ADMIN001" },
    "_count": { "inventoryRecords": 246 },
    "deadlineExtensions": [],
    "stats": {
      "totalRecords": 246,
      "submittedCount": 180,
      "pendingCount": 66,
      "storeCount": 5
    }
  }
]
```

---

#### `PATCH /admin/batches/:id`

Update the submission deadline for a cycle.

**Request body:**
```json
{
  "submissionDeadline": "2026-07-12"
}
```

Pass `null` to remove the deadline.

**Success response `200`:** The updated batch object.

---

#### `POST /admin/batches/extend`

Grant a store-specific deadline extension without changing the global deadline.

**Request body:**
```json
{
  "batchId": 12,
  "storeId": 3,
  "newDeadline": "2026-07-14",
  "note": "Stock count delayed due to public holiday"
}
```

**Rules:**
- `newDeadline` must be in the future
- Upserts — calling again with a new date updates the existing extension

**Success response `200`:** The extension record.

---

#### `DELETE /admin/batches/:id`

Delete a cycle and all its inventory records. This is permanent.

**Success response `200`:**
```json
{ "message": "Cycle deleted" }
```

---

#### `POST /admin/batches/:id/unlock-store`

Reset a store's submitted records back to PENDING, allowing the store manager to recount.

**Request body:**
```json
{ "storeId": 3 }
```

**Success response `200`:**
```json
{ "message": "42 record(s) reset to pending", "count": 42 }
```

---

#### `GET /admin/batches/:batchId/export`

Download all records for a single cycle as Excel, grouped by store.

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /admin/batches/:batchId/export-pdf`

Download all records for a single cycle as PDF.

**Response:** `application/pdf`

---

#### `POST /admin/batches/:id/send-reminders`

Send email reminders to all store managers with pending submissions for this cycle.

**Success response `200`:**
```json
{ "message": "Reminders sent", "count": 2 }
```

---

### Analytics

#### `GET /admin/analytics/trends`

Shortage rate trend data across the last N cycles, per store.

**Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `cycles` | `6` | Number of most recent cycles to include |

**Success response `200`:**
```json
{
  "batches": [
    { "id": 10, "inventoryDate": "2026-05-01T00:00:00.000Z" },
    { "id": 11, "inventoryDate": "2026-06-01T00:00:00.000Z" },
    { "id": 12, "inventoryDate": "2026-07-08T00:00:00.000Z" }
  ],
  "series": [
    {
      "storeId": 1,
      "storeName": "Kinshasa CBD",
      "data": [
        { "batchId": 10, "totalItems": 120, "shortageCount": 5, "shortageRate": 4.2, "totalUnitsLost": 18.0 },
        { "batchId": 11, "totalItems": 120, "shortageCount": 8, "shortageRate": 6.7, "totalUnitsLost": 31.5 },
        { "batchId": 12, "totalItems": 120, "shortageCount": 12, "shortageRate": 10.0, "totalUnitsLost": 47.0 }
      ]
    }
  ]
}
```

---

### Audit Log

#### `GET /admin/audit-logs`

Recent audit log entries, newest first.

**Query params:**

| Param | Description |
|-------|-------------|
| `action` | Filter by action type (see below) |
| `limit` | Max records to return (default `100`, max `500`) |

**Known `action` values:**
`LOGIN` · `CREATE_STORE` · `UPDATE_STORE` · `DELETE_STORE` · `FORCE_DELETE_STORE` · `BULK_DELETE_STORES` · `CREATE_USER` · `UPDATE_USER` · `DELETE_USER` · `UPLOAD_INVENTORY` · `DOWNLOAD_INVENTORY` · `SUBMIT_INVENTORY` · `UPDATE_INVENTORY` · `OVERRIDE_RECORD` · `UPDATE_BATCH_DEADLINE` · `GRANT_STORE_EXTENSION` · `UNLOCK_STORE_SUBMISSION` · `DELETE_BATCH` · `DOWNLOAD_BATCH_EXPORT` · `DOWNLOAD_REPORT` · `DOWNLOAD_ADMIN_INVENTORY_EXPORT` · `REPEAT_DISCREPANCY` · `DOWNLOAD_ADMIN_INVENTORY_PDF` · `DOWNLOAD_BATCH_PDF` · `DOWNLOAD_RECONCILIATION_PDF`

**Success response `200`:** Array of audit log entries with user details:
```json
[
  {
    "id": 501,
    "action": "SUBMIT_INVENTORY",
    "entityType": "INVENTORY_RECORD",
    "entityId": 12,
    "metadata": { "recordCount": 120 },
    "createdAt": "2026-07-09T14:22:00.000Z",
    "user": { "employeeId": "MGR2001", "name": "John Mwamba" }
  }
]
```

---

#### `GET /admin/audit-logs/export`

Download the audit log as Excel.

**Query params:** Same as `GET /admin/audit-logs`.

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

## Store Manager Endpoints

All store manager endpoints require `Authorization: Bearer <token>` with role `STORE_MANAGER`.

Store isolation is enforced server-side — every query filters by `req.user.storeId`. A manager cannot read or write another store's data regardless of what they send in the request.

---

### `GET /store/dashboard`

Stock count progress summary for the active cycle.

**Success response `200`:**
```json
{
  "store": {
    "id": 1,
    "storeCode": "2001",
    "storeName": "Kinshasa CBD"
  },
  "batch": {
    "id": 12,
    "inventoryDate": "2026-07-08T00:00:00.000Z",
    "submissionDeadline": "2026-07-10T23:59:00.000Z"
  },
  "stats": {
    "totalItems": 120,
    "pendingItems": 40,
    "submittedItems": 80,
    "matchedItems": 65,
    "shortageItems": 10,
    "excessItems": 5
  },
  "olderPendingBatches": [
    { "id": 11, "inventoryDate": "2026-06-01T00:00:00.000Z" }
  ]
}
```

`olderPendingBatches` is an array of earlier cycles that still have pending items. Non-empty when an admin uploads inventory dated in the past.

---

### `GET /store/notifications`

Real-time notification items for the store manager. Never cached.

**Success response `200`:**
```json
{
  "items": [
    {
      "type": "pending",
      "message": "8 Jul 2026 — Items waiting for your count",
      "batchId": 12,
      "urgent": false
    },
    {
      "type": "overdue",
      "message": "1 Jun 2026 — Past deadline, contact your admin",
      "batchId": 11,
      "urgent": true
    }
  ],
  "count": 2
}
```

**`type` values:** `pending` · `deadline` · `overdue`

---

### `GET /store/batches`

All cycles that have inventory records for this store, ordered by date descending.

**Success response `200`:**
```json
[
  {
    "id": 12,
    "inventoryDate": "2026-07-08T00:00:00.000Z",
    "uploadedAt": "2026-07-08T08:00:00.000Z",
    "totalRecords": 120,
    "pendingCount": 40,
    "submittedCount": 80
  }
]
```

---

### `GET /store/inventory`

Inventory items for this store in a given cycle.

**Query params:**

| Param | Description |
|-------|-------------|
| `batchId` | Filter by cycle ID (recommended) |
| `search` | Search item code or name |
| `status` | `PENDING` or `SUBMITTED` |

**Success response `200`:**
```json
{
  "records": [
    {
      "id": 1001,
      "materialCode": "1000013986",
      "materialName": "Whisky Black Label 750Ml",
      "systemQuantity": 50,
      "physicalQuantity": null,
      "difference": null,
      "remarks": null,
      "shrinkageCategory": null,
      "status": "PENDING"
    }
  ],
  "isLocked": false
}
```

`isLocked: true` when the submission deadline has passed and the manager can no longer edit records.

---

### `PATCH /store/inventory/:id`

Save counted quantity and/or remarks for a single item. Called automatically 700 ms after the manager stops typing.

**Request body** (all fields optional — only send what changed):
```json
{
  "physicalQuantity": 45,
  "systemQuantity": 50,
  "remarks": "Water exposure damage",
  "shrinkageCategory": "Damage"
}
```

**Rules:**
- Cannot edit a `SUBMITTED` record
- Cannot edit if the batch deadline has passed (returns `403`)
- `physicalQuantity: null` or `""` explicitly clears the count
- Variance (`difference`) is always recalculated server-side

**Success response `200`:** The updated inventory record.

---

### `POST /store/inventory/submit`

Submit all pending items for this store in a given cycle. Marks all records as `SUBMITTED`.

**Request body:**
```json
{ "batchId": 12 }
```

**Server-side validation (in a transaction):**
1. All pending items must have a `physicalQuantity`
2. All items with a non-zero variance must have a `shrinkageCategory`
3. All items with a non-zero variance must have non-empty `remarks`

**Success response `200`:**
```json
{
  "message": "Inventory submitted successfully",
  "recordCount": 120,
  "records": [
    {
      "id": 1001,
      "materialCode": "1000013986",
      "physicalQuantity": 45,
      "difference": -5,
      "status": "SUBMITTED"
    }
  ]
}
```

---

### `GET /store/inventory/download`

Download this store's inventory for a given cycle as Excel.

**Query params:**

| Param | Description |
|-------|-------------|
| `batchId` | Cycle to download (defaults to the most recent cycle) |

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
**Filename:** `store_{storeCode}_inventory.xlsx`

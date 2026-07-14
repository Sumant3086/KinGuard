# Database Schema

## Overview

The database is PostgreSQL 15+ managed via Prisma 5. All migrations live in `server/prisma/migrations/`. The schema file is `server/prisma/schema.prisma`.

| Table | Row count (typical) | Description |
|-------|---------------------|-------------|
| `Store` | 5 – 50 | One row per retail location |
| `User` | 10 – 100 | Admin and Store Manager accounts |
| `UploadBatch` | 1 per cycle | One row per file upload |
| `InventoryRecord` | 50–500 per batch × stores | The core data: one row per (store, item, batch) |
| `BatchDeadlineExtension` | Occasional | Per-store deadline overrides |
| `AuditLog` | Grows indefinitely | Immutable action log |

## Entity Relationship Diagram

```
Store ──────────────────────────────────────────────────────┐
  │ 1:N                                                      │
  ├── User (storeId → Store.id)                             │
  ├── InventoryRecord (storeId → Store.id)                  │
  └── BatchDeadlineExtension (storeId → Store.id)           │
                                                             │
UploadBatch ────────────────────────────────────────────────┤
  │ 1:N                                                      │
  ├── InventoryRecord (batchId → UploadBatch.id)            │
  └── BatchDeadlineExtension (batchId → UploadBatch.id)     │
                                                             │
User ───────────────────────────────────────────────────────┤
  │ 1:N                                                      │
  ├── UploadBatch (uploadedBy → User.id)                    │
  ├── InventoryRecord via "SubmittedBy" (submittedBy → User.id) │
  ├── AuditLog (userId → User.id, nullable)                 │
  └── BatchDeadlineExtension via "DeadlineExtensions"       │
      (grantedBy → User.id)                                  │
```

## Tables

### Store

Represents a retail location.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `Int` | No | Auto-increment | Primary key |
| `storeCode` | `String` | No | — | **Unique.** Matches the Plant/Store Code in uploaded Excel files. Case-sensitive. |
| `storeName` | `String` | No | — | Human-readable store name |
| `isActive` | `Boolean` | No | `true` | Inactive stores are excluded from the admin dashboard scorecard |
| `createdAt` | `DateTime` | No | `now()` | |
| `updatedAt` | `DateTime` | No | `@updatedAt` | |

**Unique constraints:** `storeCode`  
**Indexes:** `storeCode`

### User

Admin and Store Manager accounts.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `Int` | No | Auto-increment | Primary key |
| `employeeId` | `String` | No | — | **Unique.** Used for login. |
| `name` | `String` | No | — | Full name |
| `passwordHash` | `String` | No | — | bcrypt hash (10 rounds). Never returned in API responses. |
| `role` | `UserRole` | No | — | `ADMIN` or `STORE_MANAGER` |
| `storeId` | `Int?` | Yes | — | Required for `STORE_MANAGER`, must be null for `ADMIN` |
| `isActive` | `Boolean` | No | `true` | Inactive users cannot log in |
| `email` | `String?` | Yes | — | Used for email notifications |
| `phone` | `String?` | Yes | — | For WhatsApp click-to-chat reminders |
| `createdAt` | `DateTime` | No | `now()` | |
| `updatedAt` | `DateTime` | No | `@updatedAt` | |

**Unique constraints:** `employeeId`  
**Indexes:** `employeeId`, `storeId`

### UploadBatch

One row per file upload / inventory cycle.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `Int` | No | Auto-increment | Primary key |
| `originalFileName` | `String` | No | — | The filename as uploaded |
| `storedFileName` | `String?` | Yes | — | Reserved for future file storage |
| `uploadedBy` | `Int` | No | — | FK → `User.id`. Reassigned to deleting admin if uploader is deleted. |
| `uploadedAt` | `DateTime` | No | `now()` | When the file was committed |
| `inventoryDate` | `DateTime` | No | — | The date this count is **for** (from the upload form, not `uploadedAt`) |
| `submissionDeadline` | `DateTime?` | Yes | — | Global deadline for all stores in this cycle |
| `totalRows` | `Int` | No | `0` | Total data rows in the file |
| `successfulRows` | `Int` | No | `0` | Rows that created inventory records |
| `rejectedRows` | `Int` | No | `0` | Rows that failed validation |
| `status` | `UploadStatus` | No | `PENDING` | `PENDING` during processing, `COMPLETED` on success, `FAILED` if all rows rejected |

**Indexes:** `uploadedBy`, `inventoryDate`, `status`

### InventoryRecord

The core table. One row per **(UploadBatch × Store × Item)**.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `Int` | No | Auto-increment | Primary key |
| `batchId` | `Int` | No | — | FK → `UploadBatch.id` |
| `storeId` | `Int` | No | — | FK → `Store.id` |
| `materialCode` | `String` | No | — | **Business label: "Item Code".** The SKU/material identifier from the uploaded file. |
| `materialName` | `String` | No | — | **Business label: "Item Name".** The human-readable description. |
| `systemQuantity` | `Float` | No | — | **Business label: "Book Stock".** The ERP/system quantity from the uploaded file. |
| `physicalQuantity` | `Float?` | Yes | — | **Business label: "Your Count".** Entered by the store manager. Null until counted. |
| `difference` | `Float?` | Yes | — | **Business label: "Variance".** `physicalQuantity − systemQuantity`. Computed server-side. |
| `remarks` | `String?` | Yes | — | Issue detail entered by the store manager |
| `shrinkageCategory` | `String?` | Yes | — | Category: `Dented`, `Expiry`, `Damage`, `In Transit`, `Other` |
| `status` | `InventoryStatus` | No | `PENDING` | `PENDING` until submitted, then `SUBMITTED` |
| `submittedBy` | `Int?` | Yes | — | FK → `User.id`. Set when status → SUBMITTED. Nullable on user delete. |
| `submittedAt` | `DateTime?` | Yes | — | When the record was submitted |
| `createdAt` | `DateTime` | No | `now()` | |
| `updatedAt` | `DateTime` | No | `@updatedAt` | |

**Unique constraint:** `(batchId, storeId, materialCode)` — prevents duplicate rows on re-upload (`skipDuplicates` in `createMany`).

**Indexes:** `batchId`, `storeId`, `materialCode`, `status`, `submittedAt`, `(storeId, batchId)`, `(storeId, status)`, `(batchId, status)`

### BatchDeadlineExtension

Per-store deadline overrides. When an extension exists for a (batch, store) pair, the extension deadline supersedes the batch's global deadline.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `Int` | No | Auto-increment | Primary key |
| `batchId` | `Int` | No | — | FK → `UploadBatch.id` |
| `storeId` | `Int` | No | — | FK → `Store.id` |
| `newDeadline` | `DateTime` | No | — | The extended deadline for this store. Must be in the future when granted. |
| `grantedBy` | `Int` | No | — | FK → `User.id`. Admin who granted the extension. |
| `grantedAt` | `DateTime` | No | `now()` | |
| `note` | `String?` | Yes | — | Admin's reason for the extension |

**Unique constraint:** `(batchId, storeId)` — one extension per store per batch. Upserted on update.  
**Indexes:** `batchId`, `storeId`

### AuditLog

Immutable record of every significant action in the system. Never deleted.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `Int` | No | Auto-increment | Primary key |
| `userId` | `Int?` | Yes | — | FK → `User.id`. Set to null if the user is later deleted. |
| `action` | `String` | No | — | Action type string (see API Reference for full list) |
| `entityType` | `String?` | Yes | — | The type of entity affected: `STORE`, `USER`, `UPLOAD_BATCH`, `INVENTORY_RECORD` |
| `entityId` | `Int?` | Yes | — | The ID of the affected entity |
| `metadata` | `Json?` | Yes | — | Action-specific context (before/after values, counts, etc.) |
| `createdAt` | `DateTime` | No | `now()` | |

**Indexes:** `userId`, `action`, `createdAt`

## Enums

### `UserRole`

| Value | Description |
|-------|-------------|
| `ADMIN` | Full access — all stores, all operations |
| `STORE_MANAGER` | Scoped to a single store |

### `UploadStatus`

| Value | Description |
|-------|-------------|
| `PENDING` | File is being processed |
| `COMPLETED` | At least one row was successfully imported |
| `FAILED` | All rows were rejected |

### `InventoryStatus`

| Value | Description |
|-------|-------------|
| `PENDING` | Store manager has not yet submitted this item |
| `SUBMITTED` | Count has been entered and submitted |

## Indexes

The following composite and single-column indexes are defined to support the most frequent query patterns:

| Table | Index columns | Optimises |
|-------|--------------|-----------|
| `Store` | `storeCode` | Store lookup by code during file upload |
| `User` | `employeeId` | Login lookup |
| `User` | `storeId` | "All managers for store X" queries |
| `UploadBatch` | `uploadedBy` | Join with User |
| `UploadBatch` | `inventoryDate` | Most-recent batch lookups |
| `UploadBatch` | `status` | "All COMPLETED batches" queries |
| `InventoryRecord` | `batchId` | All records in a batch |
| `InventoryRecord` | `storeId` | All records for a store |
| `InventoryRecord` | `materialCode` | Search by item code |
| `InventoryRecord` | `status` | PENDING vs SUBMITTED filtering |
| `InventoryRecord` | `submittedAt` | Notification system (last 24h submissions) |
| `InventoryRecord` | `(storeId, batchId)` | Dashboard stats per store per batch |
| `InventoryRecord` | `(storeId, status)` | "All pending items for store X" |
| `InventoryRecord` | `(batchId, status)` | "All submitted in batch X" |
| `BatchDeadlineExtension` | `batchId`, `storeId` | Extension lookup per (batch, store) |
| `AuditLog` | `userId`, `action`, `createdAt` | Filtered audit log queries |

## Data Dictionary

### Field Name Mapping

The database uses technical field names that differ from the business labels shown in the UI. This is intentional — it separates the data model from the presentation layer.

| DB Field | Business Label | Description |
|----------|---------------|-------------|
| `materialCode` | Item Code | The SKU / ERP material identifier |
| `materialName` | Item Name | Human-readable description of the item |
| `systemQuantity` | Book Stock | Quantity from the ERP / management system |
| `physicalQuantity` | Your Count / Counted | Quantity physically counted by the store manager |
| `difference` | Variance | `physicalQuantity − systemQuantity` (negative = shortage) |

### Variance Logic

```
Variance = Your Count − Book Stock

Variance = 0   → Exact Match
Variance < 0   → Shortage (items missing — potential theft, damage, or loss)
Variance > 0   → Surplus (extra items — receiving error or count error)
```

## Column Name Quirk

When this system was first designed, the `materialCode` DB field was used to store the item's **name/identifier** (what you search for), and `materialName` was used for the **description** (the longer human-readable text). This mapping differs from what you might intuitively expect.

The current UI and all Excel exports present them correctly as **Item Code** and **Item Name** respectively. If you are querying the database directly, remember:

- `materialCode` → what the UI calls **"Item Code"** (e.g., `1000013986`)
- `materialName` → what the UI calls **"Item Name"** (e.g., `Whisky Black Label 750Ml`)


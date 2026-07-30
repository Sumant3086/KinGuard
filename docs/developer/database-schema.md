# Database Schema

PostgreSQL via Prisma ORM. Source of truth: `server/prisma/schema.prisma`. This document mirrors it — if they ever disagree, the schema file wins.

## Enums

```
UserRole          ADMIN | AREA_MANAGER | STORE_MANAGER
UploadStatus      PENDING | COMPLETED | FAILED
InventoryStatus   PENDING | SUBMITTED
ReviewStatus      PENDING_REVIEW | APPROVED | RETURNED
```

Shrinkage categories are not a Prisma enum — `InventoryRecord.shrinkageCategory` is a free-text column, validated server-side against a fixed list in `server/src/utils/shrinkageCategories.js`:

```
Dented, Expiry, Damage, In Transit, Theft, Miscount, Transfer, Supplier, Other
```

## Tables

### Store

| Column | Type | Notes |
|---|---|---|
| id | Int | PK, autoincrement |
| storeCode | String | unique — must match the ERP export exactly |
| storeName | String | |
| isActive | Boolean | default true. Inactive stores are hidden from the scorecard but keep their history |
| areaManagerId | Int? | FK → User. Nullable — a store can be unassigned |
| createdAt / updatedAt | DateTime | |

Indexes: `storeCode`, `areaManagerId`.

### User

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| employeeId | String | unique login identifier |
| name | String | |
| passwordHash | String | bcrypt, cost factor 10 |
| role | UserRole | ADMIN / AREA_MANAGER / STORE_MANAGER |
| storeId | Int? | FK → Store. Set for store managers only |
| isActive | Boolean | default true. Deactivating a user blocks login immediately |
| pendingApproval | Boolean | default false — self-registered accounts awaiting admin approval |
| mustChangePassword | Boolean | default false — forces a password change on next login (used for admin-issued temp passwords) |
| source | String | default `"MANUAL"` — how the account was created |
| email | String? | unique, nullable |
| phone | String? | nullable |
| loginAttempts | Int | default 0 — consecutive failed logins, resets on success |
| lockedUntil | DateTime? | nullable — set when `loginAttempts` crosses the lockout threshold |
| createdAt / updatedAt | DateTime | |

Indexes: `employeeId`, `storeId`.

A store manager belongs to exactly one store (`storeId`). An area manager instead owns zero or more stores through the reverse relation on `Store.areaManagerId` — there is no `AREA_MANAGER`-specific column on `User` itself.

### RefreshToken

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| token | String | unique, random, stored server-side (not just signed) so it can be revoked |
| userId | Int | FK → User, `onDelete: Cascade` |
| expiresAt | DateTime | 7 days from issue |
| createdAt | DateTime | |

Indexes: `userId`, `expiresAt`. Expired rows for a user are swept opportunistically on their next login.

### UploadBatch

One row per inventory cycle (one master file upload).

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| originalFileName | String | as uploaded |
| storedFileName | String? | server-side filename, if retained |
| uploadedBy | Int | FK → User |
| uploadedAt | DateTime | |
| inventoryDate | DateTime | the date this cycle counts stock *for* — distinct from `uploadedAt` |
| submissionDeadline | DateTime? | nullable — cycles can run with no deadline |
| autoReminderSentAt | DateTime? | set once the deadline-passed reminder email has fired, so it isn't sent twice |
| escalationLevel | Int | default 0 — 0 = none sent, 1 = AM notified at deadline, 2 = admin notified 24h after |
| totalRows / successfulRows / rejectedRows | Int | row-level outcome of the source file parse |
| status | UploadStatus | PENDING while processing, COMPLETED once records are created, FAILED on parse error |
| isDeleted / deletedAt / deletedBy | Boolean / DateTime? / Int? | soft delete — cycles are never hard-deleted so audit history survives |

Indexes: `uploadedBy`, `inventoryDate`, `status`.

### InventoryRecord

One row per store × item within a cycle. The core table.

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| batchId | Int | FK → UploadBatch |
| storeId | Int | FK → Store |
| materialCode | String | item code — labeled "Item Code" in the UI |
| materialName | String | item description — labeled "Item Name" in the UI |
| systemQuantity | Float? | book stock — labeled "Book Stock". Nullable: an upload may leave the column blank for the store to supply, and null ("no figure") is never conflated with 0 ("the book says none"). Locks at submission. See below |
| physicalQuantity | Float? | nullable until the store manager counts it — labeled "Your Count". Set back to null by an AM return, an admin unlock, or a bulk reset |
| difference | Float? | `physicalQuantity - systemQuantity`, computed server-side to 4 decimal places, never client-writable — labeled "Variance". Null whenever **either** quantity is null |
| remarks | String? | issue detail entered by the store manager |
| shrinkageCategory | String? | one of the 9 canonical categories, required when `difference != 0` |
| isRepeat | Boolean | default false — true if this store/material pair was also short in a recent prior cycle. Cleared when an admin resets the record back to PENDING |
| status | InventoryStatus | PENDING or SUBMITTED |
| submittedBy | Int? | FK → User, nullable (nulled if the submitting user is later deleted) |
| submittedAt | DateTime? | |

Unique constraint: `(batchId, storeId, materialCode)` — one record per item per store per cycle.

Indexes: `batchId`, `storeId`, `materialCode`, `status`, `submittedAt`, `(storeId, batchId)`, `(storeId, status)`, `(batchId, status)`, `(batchId, status, difference)` — the composite indexes back the dashboard scorecard and reconciliation report queries, which always filter by batch/store plus status or variance direction.

Variance logic:

```
Variance = Your Count − Book Stock

Variance = 0   → Exact Match
Variance < 0   → Shortage (items missing)
Variance > 0   → Surplus (extra items)
```

Which side of that subtraction is writable is the load-bearing decision in the schema:

| Column | Writable by |
|---|---|
| `systemQuantity` | The admin upload pipeline, the store manager (own store, **before** submit), and the admin single override. Not the area manager, not the bulk override |
| `physicalQuantity` | Store manager (own store, before submit), area manager (assigned stores, after submit), admin override |
| `difference` | Nobody — always recomputed from the two columns above |

The store write path exists because the upload template ships with the Book Stock column blank, so a store frequently has to supply the figure itself. What protects the audit is the timing, not the role: `storeController.updateInventoryRecord` rejects every write once the record is `SUBMITTED`, and neither submit path will move a record to `SUBMITTED` while `systemQuantity` is null — so the baseline and the count freeze together, and a frozen record always has both. Changes are recorded in the audit log (`previousSystemQuantity` for the store path, `before.systemQuantity` for the override).

While the record is open, this does mean a store manager can enter a baseline that flatters their own count. That is a deliberate trade for supporting blank uploads, and the audit trail rather than the schema is what catches it. If a code review turns up `systemQuantity` in a handler's write set outside those three paths — or in one of them without its status gate and audit entry — that is a defect regardless of how the feature was framed.

Migration `20260730000003_system_quantity_nullable` dropped the NOT NULL constraint. Existing rows holding `0` were deliberately left as `0`: some of them are genuine zeros, and there is no way after the fact to tell those apart from the ones an earlier blank cell turned into `0`. Rewriting them would have destroyed real data to fix presentational ones.

### AreaManagerReview

One row per store per cycle, tracking the area manager's sign-off.

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| batchId | Int | FK → UploadBatch, `onDelete: Cascade` |
| storeId | Int | FK → Store, `onDelete: Cascade` |
| areaManagerId | Int | FK → User |
| status | ReviewStatus | PENDING_REVIEW / APPROVED / RETURNED |
| remarks | String? | AM's note — required when returning, optional when approving |
| reviewedAt | DateTime? | set when status leaves PENDING_REVIEW |

Unique constraint: `(batchId, storeId)` — one review per store per cycle.

### AuditLog

Immutable action trail. No update or delete path exists anywhere in the codebase for this table — rows are append-only. It has no cascade from `User`, so deleting a user nulls `userId` on their past log entries rather than removing the entries.

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| userId | Int? | FK → User, nullable (nulled, not cascaded, on user deletion) |
| action | String | e.g. `LOGIN`, `OVERRIDE_RECORD`, `DELETE_USER` |
| entityType | String? | e.g. `USER`, `STORE`, `UPLOAD_BATCH` |
| entityId | Int? | |
| metadata | Json? | action-specific details (before/after values, etc.) |
| createdAt | DateTime | |

Indexes: `userId`, `action`, `createdAt`, `(entityType, entityId)`.

### CycleSchedule

Recurring-cycle configuration (weekly / monthly / quarterly auto-creation).

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| name | String | display name, e.g. "Monthly Physical Count" |
| frequency | String | `'weekly'` \| `'monthly'` \| `'quarterly'` |
| dayOfMonth | Int? | 1–28, for monthly/quarterly |
| dayOfWeek | Int? | 0–6 (0 = Sunday), for weekly |
| submissionWindowDays | Int | default 7 — days store managers get before the auto-set deadline |
| isActive | Boolean | default true — toggling this pauses/resumes the schedule |
| lastRunAt / nextRunAt | DateTime? | bookkeeping for the scheduler |
| createdBy | Int | FK → User — reassigned to the deleting admin if that user is later removed (column is NOT NULL, so it's never nulled) |

Index: `(isActive, nextRunAt)` — the scheduler polls on exactly this pair.

### BatchDeadlineExtension

Per-store deadline override within a cycle. When a row exists for a (batch, store) pair, `newDeadline` supersedes the batch's global `submissionDeadline` for that store only.

| Column | Type | Notes |
|---|---|---|
| id | Int | PK |
| batchId | Int | FK → UploadBatch |
| storeId | Int | FK → Store |
| newDeadline | DateTime | |
| grantedBy | Int | FK → User |
| grantedAt | DateTime | |
| note | String? | optional admin note |

Unique constraint: `(batchId, storeId)` — granting again for the same store/cycle replaces the existing extension rather than creating a second one.

## Relationships at a glance

```
Store 1──* User               (a store's assigned staff)
Store 1──* InventoryRecord
User (AREA_MANAGER) 1──* Store  (stores that AM owns, via Store.areaManagerId)
User 1──* UploadBatch          (uploader)
User 1──* RefreshToken
UploadBatch 1──* InventoryRecord
UploadBatch 1──* AreaManagerReview
UploadBatch 1──* BatchDeadlineExtension
Store 1──* AreaManagerReview
Store 1──* BatchDeadlineExtension
```

## Cascade behavior

Only two relations cascade on delete: `RefreshToken → User` and `AreaManagerReview → UploadBatch` / `AreaManagerReview → Store`. Everything else is deliberately non-cascading — deleting a user reassigns or nulls their foreign keys (see `deleteUser` in `adminController.js`) instead of deleting dependent rows, so cycle history and audit trails are never silently destroyed by a user or store deletion.

## Querying Soft-Deleted Cycles

`UploadBatch.isDeleted` is a soft-delete flag, not a display preference. Deleted cycles keep every one of their inventory records, and those records remain joinable — which means **any query that reaches `InventoryRecord` without filtering the parent batch will silently include deleted cycles.**

Every read path must therefore constrain the batch:

```js
where: { batch: { isDeleted: false }, /* … */ }
```

or, when querying batches directly, `where: { isDeleted: false }`.

Getting this wrong does not throw. It produces plausible-looking numbers that quietly include a cycle an administrator deleted precisely because it was wrong — a duplicate upload double-counting a network's shrinkage, for instance. Dashboards, scorecards, analytics, exports, and the area manager's record view all carry this filter; a new aggregate query is the likely place for it to go missing.

The audit log is the deliberate exception: `AuditLog` rows are never filtered by batch deletion, and a database trigger blocks `DELETE` on that table entirely. The record that a cycle was deleted must outlive the cycle.

-- Composite indexes for the hottest read paths. Index-only additions: no data or
-- behaviour changes, only planner improvements.

-- "Latest completed cycle" — the single most repeated query in the app.
-- Used by the admin dashboard + notifications, the AM dashboard + notifications +
-- batch list, and all three analytics endpoints. Without this the planner either
-- scans the inventoryDate index and filters, or scans status and sorts.
CREATE INDEX IF NOT EXISTS "UploadBatch_status_isDeleted_inventoryDate_idx"
    ON "UploadBatch"("status", "isDeleted", "inventoryDate");

-- The un-statused variant: every live cycle, newest first. Used by the admin batch
-- list, the store batch list / dashboard / notifications, and repeat-discrepancy
-- detection. The index above cannot serve these because status is not in the filter.
CREATE INDEX IF NOT EXISTS "UploadBatch_isDeleted_inventoryDate_idx"
    ON "UploadBatch"("isDeleted", "inventoryDate");

-- Audit log filtered by action, newest first. Separate action/createdAt indexes
-- force a filter-then-sort; this one returns rows already ordered.
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"
    ON "AuditLog"("action", "createdAt");

-- Store notification feed looks up RETURNED reviews for one store.
CREATE INDEX IF NOT EXISTS "AreaManagerReview_storeId_status_idx"
    ON "AreaManagerReview"("storeId", "status");

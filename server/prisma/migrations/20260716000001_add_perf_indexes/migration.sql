-- Add composite index for hotspot detection queries (batchId + status + difference)
CREATE INDEX IF NOT EXISTS "InventoryRecord_batchId_status_difference_idx" ON "InventoryRecord"("batchId", "status", "difference");

-- Add composite index for AM dashboard queries (batchId + areaManagerId + status)
CREATE INDEX IF NOT EXISTS "AreaManagerReview_batchId_areaManagerId_status_idx" ON "AreaManagerReview"("batchId", "areaManagerId", "status");

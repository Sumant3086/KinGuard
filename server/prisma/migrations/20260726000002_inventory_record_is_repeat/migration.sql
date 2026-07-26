-- Store the repeat-discrepancy flag on the record itself so getInventory
-- does not need a second cross-batch query to compute it on every page load.
-- The flag is set by detectRepeatDiscrepancies after each store submission
-- and cleared when a record is unlocked or returned for recount.
ALTER TABLE "InventoryRecord" ADD COLUMN "isRepeat" BOOLEAN NOT NULL DEFAULT false;

-- Index supports the updateMany in detectRepeatDiscrepancies efficiently
CREATE INDEX "InventoryRecord_isRepeat_idx" ON "InventoryRecord"("isRepeat");

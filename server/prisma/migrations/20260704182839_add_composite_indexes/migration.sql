-- CreateIndex
CREATE INDEX "InventoryRecord_storeId_batchId_idx" ON "InventoryRecord"("storeId", "batchId");

-- CreateIndex
CREATE INDEX "InventoryRecord_storeId_status_idx" ON "InventoryRecord"("storeId", "status");

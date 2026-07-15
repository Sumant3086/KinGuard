-- Add composite index on AuditLog(entityType, entityId) for faster audit queries filtered by entity
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

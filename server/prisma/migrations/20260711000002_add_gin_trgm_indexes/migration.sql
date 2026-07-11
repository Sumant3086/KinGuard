-- Enable pg_trgm extension for trigram-based text search.
-- This allows ILIKE '%term%' queries to use a GIN index instead of a
-- sequential scan, making material code / description search sub-second even
-- on tables with 100k+ rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes on the two searchable text columns
-- Note: CONCURRENTLY omitted — Prisma wraps migrations in transactions and
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
CREATE INDEX IF NOT EXISTS "InventoryRecord_materialCode_trgm"
    ON "InventoryRecord" USING GIN ("materialCode" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "InventoryRecord_materialName_trgm"
    ON "InventoryRecord" USING GIN ("materialName" gin_trgm_ops);

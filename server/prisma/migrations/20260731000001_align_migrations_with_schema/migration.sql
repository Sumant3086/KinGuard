-- Brings the migration history back in line with schema.prisma.
--
-- Several schema changes were applied to the live database directly (prisma db push /
-- migrate dev) without the generated SQL ever being committed. The running database has
-- them; a fresh `prisma migrate deploy` did not. Anyone setting the project up from the
-- repository got a database with no submission deadlines, no shrinkage categories, no
-- BatchDeadlineExtension table, and no unique constraint stopping duplicate inventory
-- rows — while every one of those features looked fine in production.
--
-- Every statement is guarded with IF NOT EXISTS so this is a no-op against a database
-- that already has the objects, and a repair against one that does not.
--
-- Two differences are deliberately left open, because closing either would touch a live
-- object to change nothing an application can observe:
--   * schema.prisma's @unique on User.email implies an index named "User_email_key",
--     while migration 20260711000001 created "User_email_unique" as a partial index.
--     Both enforce the same rule; a second unique index would cost storage and write
--     time to fix a name.
--   * CycleSchedule.createdBy's foreign key was created inline, so it carries NO ACTION
--     where Prisma would emit RESTRICT. For a non-deferred constraint the two behave
--     identically.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE "InventoryRecord" ADD COLUMN IF NOT EXISTS "shrinkageCategory" TEXT;
ALTER TABLE "UploadBatch"     ADD COLUMN IF NOT EXISTS "submissionDeadline" TIMESTAMP(3);

-- ── Per-store deadline extensions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BatchDeadlineExtension" (
    "id"          SERIAL       NOT NULL,
    "batchId"     INTEGER      NOT NULL,
    "storeId"     INTEGER      NOT NULL,
    "newDeadline" TIMESTAMP(3) NOT NULL,
    "grantedBy"   INTEGER      NOT NULL,
    "grantedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"        TEXT,

    CONSTRAINT "BatchDeadlineExtension_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BatchDeadlineExtension_batchId_idx" ON "BatchDeadlineExtension"("batchId");
CREATE INDEX IF NOT EXISTS "BatchDeadlineExtension_storeId_idx" ON "BatchDeadlineExtension"("storeId");

-- One extension per store per cycle: granting again replaces the existing row rather
-- than stacking a second, ambiguous deadline on top of it.
CREATE UNIQUE INDEX IF NOT EXISTS "BatchDeadlineExtension_batchId_storeId_key"
    ON "BatchDeadlineExtension"("batchId", "storeId");

-- ── Inventory constraints ────────────────────────────────────────────────────
-- One row per item per store per cycle. Without this a re-run of an upload silently
-- doubles a store's line items and every aggregate built on them.
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryRecord_batchId_storeId_materialCode_key"
    ON "InventoryRecord"("batchId", "storeId", "materialCode");

CREATE INDEX IF NOT EXISTS "InventoryRecord_batchId_status_idx" ON "InventoryRecord"("batchId", "status");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
-- ADD CONSTRAINT has no IF NOT EXISTS, so each one is checked against the catalog first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchDeadlineExtension_batchId_fkey') THEN
    ALTER TABLE "BatchDeadlineExtension"
      ADD CONSTRAINT "BatchDeadlineExtension_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchDeadlineExtension_storeId_fkey') THEN
    ALTER TABLE "BatchDeadlineExtension"
      ADD CONSTRAINT "BatchDeadlineExtension_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BatchDeadlineExtension_grantedBy_fkey') THEN
    ALTER TABLE "BatchDeadlineExtension"
      ADD CONSTRAINT "BatchDeadlineExtension_grantedBy_fkey"
      FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

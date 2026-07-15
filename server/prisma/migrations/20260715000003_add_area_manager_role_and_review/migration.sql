-- Add AREA_MANAGER to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AREA_MANAGER';

-- Add ReviewStatus enum (safe re-run)
DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add areaManagerId to Store
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "areaManagerId" INTEGER;

-- Add FK constraint (safe re-run with exception handler)
DO $$ BEGIN
  ALTER TABLE "Store" ADD CONSTRAINT "Store_areaManagerId_fkey"
    FOREIGN KEY ("areaManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Store_areaManagerId_idx" ON "Store"("areaManagerId");

-- Create AreaManagerReview table
CREATE TABLE IF NOT EXISTS "AreaManagerReview" (
  "id"            SERIAL PRIMARY KEY,
  "batchId"       INTEGER NOT NULL,
  "storeId"       INTEGER NOT NULL,
  "areaManagerId" INTEGER NOT NULL,
  "status"        "ReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "remarks"       TEXT,
  "reviewedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add FK constraints to AreaManagerReview (safe re-run)
DO $$ BEGIN
  ALTER TABLE "AreaManagerReview" ADD CONSTRAINT "AreaManagerReview_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AreaManagerReview" ADD CONSTRAINT "AreaManagerReview_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AreaManagerReview" ADD CONSTRAINT "AreaManagerReview_areaManagerId_fkey"
    FOREIGN KEY ("areaManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "AreaManagerReview" ADD CONSTRAINT "AreaManagerReview_batchId_storeId_key"
    UNIQUE ("batchId", "storeId");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AreaManagerReview_batchId_idx"       ON "AreaManagerReview"("batchId");
CREATE INDEX IF NOT EXISTS "AreaManagerReview_areaManagerId_idx" ON "AreaManagerReview"("areaManagerId");
CREATE INDEX IF NOT EXISTS "AreaManagerReview_storeId_idx"       ON "AreaManagerReview"("storeId");
CREATE INDEX IF NOT EXISTS "AreaManagerReview_status_idx"        ON "AreaManagerReview"("status");

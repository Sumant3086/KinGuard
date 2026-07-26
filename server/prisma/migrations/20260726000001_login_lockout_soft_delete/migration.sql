-- Add DB-backed login lockout fields to User
ALTER TABLE "User" ADD COLUMN "loginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Add soft-delete fields to UploadBatch so cycles can be recovered after accidental deletion
ALTER TABLE "UploadBatch" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UploadBatch" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "UploadBatch" ADD COLUMN "deletedBy" INTEGER;

-- Index for fast lockout check on login
CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");

-- Index for filtering out soft-deleted batches in list queries
CREATE INDEX "UploadBatch_isDeleted_idx" ON "UploadBatch"("isDeleted");

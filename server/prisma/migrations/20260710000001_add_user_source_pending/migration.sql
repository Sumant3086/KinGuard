-- Add source and pendingApproval fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- ── Feature: Audit trail immutability ────────────────────────────────────────
-- Block all DELETE operations on AuditLog at the database level.
-- Application code can still INSERT (createAuditLog) but never DELETE.
CREATE OR REPLACE FUNCTION prevent_audit_log_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are permanent records and cannot be deleted';
END;
$$;

CREATE TRIGGER audit_log_immutable
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_delete();

-- ── Feature: Post-deadline escalation tracking ────────────────────────────────
-- Tracks which escalation tier has fired for each batch after the deadline passes.
-- 0 = none sent, 1 = Area Manager notified, 2 = Admin notified (urgent)
ALTER TABLE "UploadBatch" ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0;

-- ── Feature: Scheduled recurring inventory cycles ─────────────────────────────
CREATE TABLE "CycleSchedule" (
  "id"                   SERIAL PRIMARY KEY,
  "name"                 TEXT NOT NULL,
  "frequency"            TEXT NOT NULL,
  "dayOfMonth"           INTEGER,
  "dayOfWeek"            INTEGER,
  "submissionWindowDays" INTEGER NOT NULL DEFAULT 7,
  "isActive"             BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt"            TIMESTAMP(3),
  "nextRunAt"            TIMESTAMP(3),
  "createdBy"            INTEGER NOT NULL REFERENCES "User"(id),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX "CycleSchedule_isActive_nextRunAt_idx" ON "CycleSchedule"("isActive", "nextRunAt");

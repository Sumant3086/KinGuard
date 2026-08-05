-- Track the automated "1 hour left" reminder per deadline extension.
--
-- UploadBatch.autoReminderSentAt only covers the batch-level deadline, so a store
-- holding an approved extension never got an automated reminder for its own (later)
-- deadline — it was excluded from the batch reminder (correctly, since that deadline
-- no longer applies to it) but nothing ever reminded it about the real one.
ALTER TABLE "BatchDeadlineExtension" ADD COLUMN "autoReminderSentAt" TIMESTAMP(3);

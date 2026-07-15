-- Track when the automated 1-hour deadline reminder was last sent for each batch
ALTER TABLE "UploadBatch" ADD COLUMN IF NOT EXISTS "autoReminderSentAt" TIMESTAMP(3);

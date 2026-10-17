
BEGIN;

ALTER TABLE scheduled_emails
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_stale_processing
ON scheduled_emails (processing_started_at)
WHERE status = 'processing';

COMMIT;

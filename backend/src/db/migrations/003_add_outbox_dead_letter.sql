
BEGIN;

ALTER TABLE email_outbox
DROP CONSTRAINT IF EXISTS email_outbox_status_check;

ALTER TABLE email_outbox
ADD CONSTRAINT email_outbox_status_check
CHECK (status IN ('pending', 'processing', 'published', 'dead_letter'));

COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    idempotency_key VARCHAR(255) NOT NULL UNIQUE,

    recipient_email VARCHAR(320) NOT NULL,
    subject VARCHAR(998) NOT NULL,
    body_text TEXT NOT NULL,

    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (
            status IN (
                'scheduled',
                'queued',
                'processing',
                'sent',
                'failed',
                'cancelled'
            )
        ),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    last_error TEXT,
    sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (recipient_email = LOWER(TRIM(recipient_email))),
    CHECK (
        (status = 'sent' AND sent_at IS NOT NULL)
        OR
        (status <> 'sent' AND sent_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due
    ON scheduled_emails (scheduled_at)
    WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status_created
    ON scheduled_emails (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_recipient
    ON scheduled_emails (recipient_email);

COMMIT;

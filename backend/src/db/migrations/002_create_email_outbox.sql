
BEGIN;

CREATE TABLE IF NOT EXISTS email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email_id UUID NOT NULL
        REFERENCES scheduled_emails(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL
        CHECK (event_type = 'email.schedule'),

    payload JSONB NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'published')),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT email_outbox_email_event_unique
        UNIQUE (email_id, event_type),

    CONSTRAINT email_outbox_published_at_check
        CHECK (
            (status = 'published' AND published_at IS NOT NULL)
            OR
            (status <> 'published' AND published_at IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
    ON email_outbox (available_at, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_outbox_processing
    ON email_outbox (locked_at)
    WHERE status = 'processing';

COMMIT;

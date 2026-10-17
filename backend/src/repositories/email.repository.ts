
import { pool } from "../config/database";

export interface CreateScheduledEmailInput {
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  scheduledAt: Date;
}

export interface ScheduledEmail {
  id: string;
  idempotency_key: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  scheduled_at: Date;
  status: string;
  attempts: number;
  created_at: Date;
}

export async function createScheduledEmail(
  input: CreateScheduledEmailInput,
): Promise<{ email: ScheduledEmail; created: boolean }> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const idempotencyKey = input.idempotencyKey.trim();
  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("A valid recipient email is required.");
  }

  if (!idempotencyKey) {
    throw new Error("An idempotency key is required.");
  }

  if (idempotencyKey.length > 255) {
    throw new Error("The idempotency key must be 255 characters or fewer.");
  }

  if (!subject || subject.length > 998) {
    throw new Error("Subject must contain 1–998 characters.");
  }

  if (!bodyText) {
    throw new Error("Email body is required.");
  }

  if (
    !(input.scheduledAt instanceof Date) ||
    Number.isNaN(input.scheduledAt.getTime())
  ) {
    throw new Error("A valid scheduled date is required.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const inserted = await client.query<ScheduledEmail>(
      `
        INSERT INTO scheduled_emails (
          idempotency_key,
          recipient_email,
          subject,
          body_text,
          scheduled_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING
          id,
          idempotency_key,
          recipient_email,
          subject,
          body_text,
          scheduled_at,
          status,
          attempts,
          created_at
      `,
      [idempotencyKey, recipientEmail, subject, bodyText, input.scheduledAt],
    );

    if (inserted.rows[0]) {
      const email = inserted.rows[0];

      await client.query(
        `
          INSERT INTO email_outbox (
            email_id,
            event_type,
            payload
          )
          VALUES ($1, 'email.schedule', $2::jsonb)
          ON CONFLICT (email_id, event_type) DO NOTHING
        `,
        [
          email.id,
          JSON.stringify({
            emailId: email.id,
            scheduledAt: email.scheduled_at,
          }),
        ],
      );

      await client.query("COMMIT");

      return { email, created: true };
    }

    // A duplicate key may have been inserted by a concurrent request.
    const existing = await client.query<ScheduledEmail>(
      `
        SELECT
          id,
          idempotency_key,
          recipient_email,
          subject,
          body_text,
          scheduled_at,
          status,
          attempts,
          created_at
        FROM scheduled_emails
        WHERE idempotency_key = $1
      `,
      [idempotencyKey],
    );

    if (!existing.rows[0]) {
      throw new Error("Could not retrieve the existing email record.");
    }

    await client.query("COMMIT");

    return { email: existing.rows[0], created: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

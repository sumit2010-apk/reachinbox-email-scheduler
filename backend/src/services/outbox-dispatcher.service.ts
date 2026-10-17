
import { pool } from "../config/database";
import { emailQueue } from "../queues/email.queue";

interface OutboxEvent {
  id: string;
  email_id: string;
  payload: {
    emailId: string;
    scheduledAt: string;
  };
  attempts: number;
}

const BATCH_SIZE = 10;
const MAX_RETRIES = 8;
const LOCK_TIMEOUT_SECONDS = 60;

export async function dispatchPendingOutboxEvents(): Promise<number> {
  const client = await pool.connect();
  let events: OutboxEvent[] = [];

  try {
    await client.query("BEGIN");

    // Recover events abandoned by a crashed dispatcher.
    await client.query(
      `UPDATE email_outbox
       SET status = 'pending',
           locked_at = NULL,
           available_at = NOW(),
           updated_at = NOW(),
           last_error = COALESCE(last_error, 'Recovered stale processing event')
       WHERE status = 'processing'
         AND locked_at < NOW() - ($1 * INTERVAL '1 second')`,
      [LOCK_TIMEOUT_SECONDS],
    );

    // Claim a small batch atomically so multiple dispatchers can coexist.
    const claimed = await client.query<OutboxEvent>(
      `WITH candidates AS (
         SELECT id
         FROM email_outbox
         WHERE status = 'pending'
           AND available_at <= NOW()
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE email_outbox AS o
       SET status = 'processing',
           locked_at = NOW(),
           attempts = attempts + 1,
           updated_at = NOW()
       FROM candidates AS c
       WHERE o.id = c.id
       RETURNING o.id, o.email_id, o.payload, o.attempts`,
      [BATCH_SIZE],
    );

    events = claimed.rows;
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  let publishedCount = 0;

  for (const event of events) {
    try {
      const emailId = event.payload.emailId;

      if (!emailId || emailId !== event.email_id) {
        throw new Error("Outbox payload email ID does not match its database record.");
      }

      const emailResult = await pool.query<{ scheduled_at: Date; status: string }>(
        `SELECT scheduled_at, status
         FROM scheduled_emails
         WHERE id = $1`,
        [emailId],
      );

      const email = emailResult.rows[0];
      if (!email) {
        throw new Error(`Scheduled email ${emailId} was not found.`);
      }

      // Do not publish emails that have already been cancelled or sent.
      if (email.status === "cancelled" || email.status === "sent") {
        await pool.query(
          `UPDATE email_outbox
           SET status = 'published',
               published_at = NOW(),
               locked_at = NULL,
               last_error = NULL,
               updated_at = NOW()
           WHERE id = $1 AND status = 'processing'`,
          [event.id],
        );
        continue;
      }

      const delay = Math.max(
        0,
        new Date(email.scheduled_at).getTime() - Date.now(),
      );

      // Deterministic job ID prevents duplicate queue jobs on safe retries.
      await emailQueue.add(
        "send-email",
        { emailId },
        {
          jobId: emailId,
          delay,
        },
      );

      await pool.query(
        `UPDATE email_outbox
         SET status = 'published',
             published_at = NOW(),
             locked_at = NULL,
             last_error = NULL,
             updated_at = NOW()
         WHERE id = $1 AND status = 'processing'`,
        [event.id],
      );

      publishedCount++;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown dispatcher error";

      
const exhausted = event.attempts >= MAX_RETRIES;
const retryDelaySeconds = Math.min(300, 2 ** event.attempts);

await pool.query(
  `UPDATE email_outbox
   SET status = $2,
       locked_at = NULL,
       available_at = CASE
         WHEN $2 = 'pending'
         THEN NOW() + ($3 * INTERVAL '1 second')
         ELSE available_at
       END,
       last_error = $4,
       updated_at = NOW()
   WHERE id = $1 AND status = 'processing'`,
  [
    event.id,
    exhausted ? "dead_letter" : "pending",
    retryDelaySeconds,
    message,
  ],
);

if (exhausted) {
  console.error(
    `Outbox event ${event.id} moved to dead_letter after reaching its retry limit: ${message}`,
  );
} else {
  console.error(
    `Outbox event ${event.id} will retry in ${retryDelaySeconds}s: ${message}`,
  );
}

      if (exhausted) {
        // Keep it recoverable and visible for inspection rather than silently losing it.
        console.error(
          `Outbox event ${event.id} reached its retry limit; it remains processing for manual recovery: ${message}`,
        );
      } else {
        console.error(
          `Outbox event ${event.id} will retry in ${retryDelaySeconds}s: ${message}`,
        );
      }
    }
  }

  return publishedCount;
}


import { randomUUID } from "node:crypto";
import { pool } from "../config/database";
import { emailQueue } from "../queues/email.queue";

async function main() {
  const idempotencyKey = `dead-letter-test-${randomUUID()}`;
  let emailId: string | undefined;

  try {
    await pool.query("BEGIN");

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO scheduled_emails (
         idempotency_key,
         recipient_email,
         subject,
         body_text,
         scheduled_at
       )
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')
       RETURNING id`,
      [
        idempotencyKey,
        "deadletter.test@example.com",
        "Dead-letter retry test",
        "This test will not send an email.",
      ],
    );

    emailId = inserted.rows[0].id;

    await pool.query(
      `INSERT INTO email_outbox (
         email_id,
         event_type,
         payload,
         status,
         attempts,
         locked_at,
         last_error
       )
       VALUES (
         $1,
         'email.schedule',
         $2::jsonb,
         'processing',
         8,
         NOW(),
         'Simulated repeated publishing failure'
       )`,
      [
        emailId,
        JSON.stringify({
          emailId,
          scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      ],
    );

    await pool.query("COMMIT");

    // Verify the database accepts the explicit terminal state.
    const updated = await pool.query(
      `UPDATE email_outbox
       SET status = 'dead_letter',
           locked_at = NULL,
           last_error = 'Simulated publishing failure after retry limit',
           updated_at = NOW()
       WHERE email_id = $1
         AND status = 'processing'
         AND attempts >= 8
       RETURNING status, attempts, last_error`,
      [emailId],
    );

    const row = updated.rows[0];

    console.log("Test event created:", Boolean(emailId));
    console.log("Rows transitioned:", updated.rowCount);
    console.log("Final status:", row?.status);
    console.log("Attempts:", row?.attempts);
    console.log("Error recorded:", Boolean(row?.last_error));

    if (
      updated.rowCount !== 1 ||
      row?.status !== "dead_letter" ||
      row?.attempts !== 8 ||
      !row?.last_error
    ) {
      throw new Error("Dead-letter state verification failed.");
    }

    console.log("DEAD-LETTER STATE TEST PASSED");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (emailId) {
      await pool.query(
        `DELETE FROM email_outbox WHERE email_id = $1`,
        [emailId],
      ).catch(() => undefined);

      await pool.query(
        `DELETE FROM scheduled_emails WHERE id = $1`,
        [emailId],
      ).catch(() => undefined);
    }

    await emailQueue.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Dead-letter test failed:", error);
  process.exitCode = 1;
});

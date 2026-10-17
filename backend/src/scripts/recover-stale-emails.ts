
import { pool } from "../config/database";

async function recoverStaleEmails(): Promise<void> {
  const staleMinutes = Number(process.env.STALE_EMAIL_MINUTES ?? 15);

  if (!Number.isInteger(staleMinutes) || staleMinutes < 1) {
    throw new Error("STALE_EMAIL_MINUTES must be a positive integer.");
  }

  const result = await pool.query(
    `UPDATE scheduled_emails
     SET status = 'failed',
         processing_started_at = NULL,
         last_error = $1,
         updated_at = NOW()
     WHERE status = 'processing'
       AND processing_started_at < NOW() - ($2 * INTERVAL '1 minute')
     RETURNING id, recipient_email`,
    [
      "Stale processing record recovered for manual review. Delivery status may be uncertain; not automatically retried to avoid duplicate emails.",
      staleMinutes,
    ],
  );

  console.log(`Stale emails moved to failed for review: ${result.rowCount}`);

  for (const email of result.rows) {
    console.log(`Review required: ${email.id} (${email.recipient_email})`);
  }
}

recoverStaleEmails()
  .catch((error: unknown) => {
    console.error("Stale email recovery failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

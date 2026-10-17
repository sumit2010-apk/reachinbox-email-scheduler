
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";
import { createScheduledEmail } from "../repositories/email.repository";

async function main() {
  const idempotencyKey = `outbox-test-${randomUUID()}`;

  try {
    const input = {
      idempotencyKey,
      recipientEmail: "outbox.test@example.com",
      subject: "Transactional outbox test",
      bodyText: "No email will be sent.",
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    const first = await createScheduledEmail(input);
    const second = await createScheduledEmail(input);

    const result = await pool.query(
      `SELECT
         e.id AS email_id,
         e.status AS email_status,
         o.id AS outbox_id,
         o.event_type,
         o.status AS outbox_status,
         o.payload
       FROM scheduled_emails e
       LEFT JOIN email_outbox o ON o.email_id = e.id
       WHERE e.idempotency_key = $1`,
      [idempotencyKey],
    );

    console.log("First request created:", first.created);
    console.log("Second request created:", second.created);
    console.log("Database rows found:", result.rowCount);
    console.log("Outbox event type:", result.rows[0]?.event_type);
    console.log("Outbox status:", result.rows[0]?.outbox_status);
    console.log("Payload email ID matches:", result.rows[0]?.payload?.emailId === first.email.id);

    if (
      !first.created ||
      second.created ||
      result.rowCount !== 1 ||
      !result.rows[0]?.outbox_id ||
      result.rows[0]?.event_type !== "email.schedule" ||
      result.rows[0]?.outbox_status !== "pending" ||
      result.rows[0]?.payload?.emailId !== first.email.id
    ) {
      throw new Error("Transactional outbox test failed.");
    }

    console.log("TRANSACTIONAL OUTBOX TEST PASSED");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Outbox test failed:", error);
  process.exitCode = 1;
});

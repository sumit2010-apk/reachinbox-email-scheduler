
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { createScheduledEmail } from "../repositories/email.repository";
import { dispatchPendingOutboxEvents } from "../services/outbox-dispatcher.service";

async function main() {
  const idempotencyKey = `dispatcher-test-${randomUUID()}`;
  let emailId: string | undefined;

  try {
    const result = await createScheduledEmail({
      idempotencyKey,
      recipientEmail: "dispatcher.test@example.com",
      subject: "Outbox dispatcher verification",
      bodyText: "This test does not send an email.",
      scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    emailId = result.email.id;

    const before = await pool.query(
      `SELECT status FROM email_outbox WHERE email_id = $1`,
      [emailId],
    );

    if (before.rows[0]?.status !== "pending") {
      throw new Error("Expected a pending outbox event before dispatch.");
    }

    const publishedCount = await dispatchPendingOutboxEvents();

    const after = await pool.query(
      `SELECT status, published_at
       FROM email_outbox
       WHERE email_id = $1`,
      [emailId],
    );

    const job = await emailQueue.getJob(emailId);
    const jobState = job ? await job.getState() : "missing";

    console.log("Email created:", result.created);
    console.log("Outbox status before dispatch:", before.rows[0]?.status);
    console.log("Events published in this batch:", publishedCount);
    console.log("Outbox status after dispatch:", after.rows[0]?.status);
    console.log("Published timestamp exists:", Boolean(after.rows[0]?.published_at));
    console.log("BullMQ job exists:", Boolean(job));
    console.log("BullMQ job name:", job?.name);
    console.log("BullMQ job state:", jobState);
    console.log("BullMQ job ID matches email ID:", job?.id === emailId);

    if (
      !result.created ||
      after.rows[0]?.status !== "published" ||
      !after.rows[0]?.published_at ||
      !job ||
      job.name !== "send-email" ||
      job.id !== emailId ||
      jobState !== "delayed"
    ) {
      throw new Error("Outbox dispatcher verification failed.");
    }

    console.log("OUTBOX DISPATCHER TEST PASSED");
  } finally {
    // This test only queues a delayed job; it does not send an email.
    if (emailId) {
      await emailQueue.remove(emailId).catch(() => undefined);
    }

    await emailQueue.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Outbox dispatcher test failed:", error);
  process.exitCode = 1;
});

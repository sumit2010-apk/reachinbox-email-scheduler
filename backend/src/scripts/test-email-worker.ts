
import { randomUUID } from "node:crypto";
import { Queue, QueueEvents } from "bullmq";
import { pool } from "../config/database";
import { redis } from "../config/redis";
import { emailWorker } from "../workers/email.worker";

async function main(): Promise<void> {
  const emailId = randomUUID();
  const idempotencyKey = `smtp-test-${randomUUID()}`;

  const queue = new Queue("scheduled-emails", {
    connection: redis.duplicate(),
  });

  const events = new QueueEvents("scheduled-emails", {
    connection: redis.duplicate(),
  });

  try {
    await events.waitUntilReady();
    await emailWorker.waitUntilReady();

    await pool.query(
      `INSERT INTO scheduled_emails (
        id,
        idempotency_key,
        recipient_email,
        subject,
        body_text,
        scheduled_at,
        status
      )
      VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '1 minute', 'scheduled')`,
      [
        emailId,
        idempotencyKey,
        process.env.SMTP_USER,
        "ReachInbox SMTP integration test",
        `This is a test email from ReachInbox. Test ID: ${emailId}`,
      ],
    );

    const job = await queue.add(
      "send-email",
      { emailId },
      {
        jobId: emailId,
        attempts: 1,
        removeOnComplete: false,
      },
    );

    console.log("SMTP test job added:", job.id);

    const result = await job.waitUntilFinished(events, 30_000);
    console.log("Worker result:", result);

    const record = await pool.query(
      `SELECT status, attempts, sent_at, last_error
       FROM scheduled_emails
       WHERE id = $1`,
      [emailId],
    );

    const email = record.rows[0];

    console.log("Database status:", email?.status);
    console.log("Attempt count:", email?.attempts);
    console.log("Sent timestamp exists:", Boolean(email?.sent_at));

    if (
      result?.sent !== true ||
      email?.status !== "sent" ||
      !email?.sent_at ||
      email?.attempts !== 1
    ) {
      throw new Error(
        `SMTP test failed. Status: ${email?.status}; error: ${email?.last_error ?? "none"}`,
      );
    }

    console.log("SMTP EMAIL DELIVERY TEST PASSED");

    if (result.previewUrl) {
      console.log("Ethereal preview:", result.previewUrl);
    }
  } finally {
    // Remove only this test job and its test record.
    await queue.remove(emailId).catch(() => undefined);

    await pool
      .query("DELETE FROM scheduled_emails WHERE id = $1", [emailId])
      .catch(() => undefined);

    await events.close();
    await queue.close();
    await emailWorker.close();
    await pool.end();
    await redis.quit();
  }
}

main().catch((error) => {
  console.error("SMTP email test failed:", error);
  process.exitCode = 1;
});

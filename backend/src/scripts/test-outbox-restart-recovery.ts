
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { createScheduledEmail } from "../repositories/email.repository";

async function main() {
  const idempotencyKey = `restart-recovery-${randomUUID()}`;
  let emailId: string | undefined;

  try {
    const result = await createScheduledEmail({
      idempotencyKey,
      recipientEmail: "restart.test@example.com",
      subject: "Outbox restart recovery test",
      bodyText: "This test does not send an email.",
      scheduledAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    emailId = result.email.id;

    const outbox = await pool.query<{ status: string }>(
      `SELECT status FROM email_outbox WHERE email_id = $1`,
      [emailId],
    );

    console.log("Email created:", result.created);
    console.log("Initial outbox status:", outbox.rows[0]?.status);

    if (!result.created || outbox.rows[0]?.status !== "pending") {
      throw new Error("Could not create a dedicated pending recovery event.");
    }

    console.log("\nRecovery event is ready.");
    console.log("Email ID:", emailId);
    console.log("Stop the outbox dispatcher, then restart it.");
    console.log("This script will wait up to 90 seconds for publication.");

    const deadline = Date.now() + 90_000;

    while (Date.now() < deadline) {
      const check = await pool.query<{
        status: string;
        published_at: Date | null;
      }>(
        `SELECT status, published_at
         FROM email_outbox
         WHERE email_id = $1`,
        [emailId],
      );

      const row = check.rows[0];

      if (row?.status === "published" && row.published_at) {
        const job = await emailQueue.getJob(emailId);
        const jobState = job ? await job.getState() : "missing";

        console.log("\nFinal outbox status:", row.status);
        console.log("Published timestamp exists:", Boolean(row.published_at));
        console.log("BullMQ job exists:", Boolean(job));
        console.log("BullMQ job ID matches:", job?.id === emailId);
        console.log("BullMQ job state:", jobState);

        if (!job || job.id !== emailId || jobState !== "delayed") {
          throw new Error("Outbox published, but the expected delayed job is missing.");
        }

        console.log("OUTBOX RESTART RECOVERY TEST PASSED");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
      "Recovery timed out. Check that the outbox dispatcher restarted successfully.",
    );
  } finally {
    if (emailId) {
      await emailQueue.remove(emailId).catch(() => undefined);
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
  console.error("Restart recovery test failed:", error);
  process.exitCode = 1;
});

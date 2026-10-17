
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { scheduleEmail } from "../services/email-scheduling.service";

async function main() {
  const idempotencyKey = `scheduling-test-${randomUUID()}`;
  let emailId: string | undefined;

  try {
    const input = {
      idempotencyKey,
      recipientEmail: "scheduling.test@example.com",
      subject: "Outbox scheduling integration test",
      bodyText: "This test will not send an email.",
      scheduledAt: new Date(Date.now() + 10 * 60 * 1000),
    };

    const first = await scheduleEmail(input);
    emailId = first.email.id;

    const second = await scheduleEmail(input);

    const outboxResult = await pool.query<{
      status: string;
      published_at: Date | null;
    }>(
      `SELECT status, published_at
       FROM email_outbox
       WHERE email_id = $1 AND event_type = 'email.schedule'`,
      [emailId],
    );

    // The dispatcher may publish quickly, so check both the database
    // and queue after the scheduling requests have completed.
    const job = await emailQueue.getJob(emailId);
    const jobState = job ? await job.getState() : "missing";

    console.log("First request created:", first.created);
    console.log("Second request created:", second.created);
    console.log("Same email ID:", first.email.id === second.email.id);
    console.log("Outbox status:", outboxResult.rows[0]?.status);
    console.log("BullMQ job exists:", Boolean(job));
    console.log("Job name:", job?.name);
    console.log("BullMQ job state:", jobState);

    if (
      !first.created ||
      second.created ||
      first.email.id !== second.email.id ||
      outboxResult.rowCount !== 1 ||
      !["pending", "processing", "published"].includes(
        outboxResult.rows[0]?.status ?? "",
      )
    ) {
      throw new Error("Scheduling persistence/idempotency test failed.");
    }

    // If the background dispatcher is running, the job should eventually
    // appear. Poll for up to 5 seconds without creating duplicate jobs.
    let observedJob = job;

    for (let attempt = 0; attempt < 50 && !observedJob; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      observedJob = await emailQueue.getJob(emailId);
    }

    const finalOutbox = await pool.query<{ status: string }>(
      `SELECT status FROM email_outbox WHERE email_id = $1`,
      [emailId],
    );

    const finalJobState = observedJob
      ? await observedJob.getState()
      : "missing";

    console.log("Final outbox status:", finalOutbox.rows[0]?.status);
    console.log("Job appeared:", Boolean(observedJob));
    console.log("Final BullMQ job state:", finalJobState);

    if (
      finalOutbox.rows[0]?.status !== "published" ||
      !observedJob ||
      observedJob.name !== "send-email" ||
      observedJob.id !== emailId ||
      finalJobState !== "delayed"
    ) {
      throw new Error(
        "Dispatcher integration check failed. Confirm the outbox worker is running in another terminal.",
      );
    }

    console.log("OUTBOX SCHEDULING INTEGRATION TEST PASSED");
  } finally {
    // Remove only this test's delayed job and test records.
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
  console.error("Scheduling integration test failed:", error);
  process.exitCode = 1;
});

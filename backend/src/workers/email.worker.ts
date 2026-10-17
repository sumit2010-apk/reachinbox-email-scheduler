
import { Worker } from "bullmq";
import { pool } from "../config/database";
import { redis } from "../config/redis";
import { sendEmail } from "../services/email-delivery.service";

interface EmailJobData {
  emailId: string;
}

interface EmailRecord {
  id: string;
  status: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  scheduled_at: Date;
}

interface ClaimResult {
  id: string;
}

const emailWorkerConnection = redis.duplicate();

export const emailWorker = new Worker<EmailJobData>(
  "scheduled-emails",
  async (job) => {
    const { emailId } = job.data;

    if (!emailId) {
      throw new Error("Email job is missing its emailId.");
    }

    const result = await pool.query<EmailRecord>(
      `SELECT id, status, recipient_email, subject, body_text, scheduled_at
       FROM scheduled_emails
       WHERE id = $1`,
      [emailId],
    );

    const email = result.rows[0];

    if (!email) {
      throw new Error(`Scheduled email ${emailId} was not found.`);
    }

    if (["sent", "cancelled", "failed"].includes(email.status)) {
      console.log(`Skipping email ${emailId} with status ${email.status}.`);
      return { skipped: true, status: email.status };
    }

    if (new Date(email.scheduled_at).getTime() > Date.now()) {
      throw new Error(`Email ${emailId} is not due yet.`);
    }

    // Atomically claim the email. Only one worker can claim it.
    const claimed = await pool.query<ClaimResult>(
      `UPDATE scheduled_emails
       SET status = 'processing',
           processing_started_at = NOW(),
           attempts = attempts + 1,
           last_error = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND status IN ('scheduled', 'queued')
         AND scheduled_at <= NOW()
       RETURNING id`,
      [emailId],
    );

    if (claimed.rowCount !== 1) {
      console.log(`Email ${emailId} was already claimed or is no longer eligible.`);
      return { skipped: true, reason: "not_claimable" };
    }

    // Only reset to queued when SMTP sending itself fails.
    // This allows BullMQ to retry the job.
    let delivery: Awaited<ReturnType<typeof sendEmail>>;

    try {
      delivery = await sendEmail({
        emailId,
        recipientEmail: email.recipient_email,
        subject: email.subject,
        bodyText: email.body_text,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await pool.query(
        `UPDATE scheduled_emails
         SET status = 'queued',
             processing_started_at = NULL,
             last_error = $2,
             updated_at = NOW()
         WHERE id = $1 AND status = 'processing'`,
        [emailId, errorMessage.slice(0, 5000)],
      );

      throw error;
    }

    // SMTP accepted the message. Record that result in PostgreSQL.
    // If this database update fails, leave the record processing rather
    // than automatically making it eligible for another SMTP send.
    const completed = await pool.query(
      `UPDATE scheduled_emails
       SET status = 'sent',
           sent_at = NOW(),
           processing_started_at = NULL,
           last_error = NULL,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'processing'
       RETURNING id`,
      [emailId],
    );

    if (completed.rowCount !== 1) {
      throw new Error(
        `SMTP accepted email ${emailId}, but its database status could not be finalized.`,
      );
    }

    console.log(
      `Email ${emailId} accepted by SMTP. Message ID: ${delivery.messageId}`,
    );

    if (delivery.previewUrl) {
      console.log(`Ethereal preview: ${delivery.previewUrl}`);
    }

    return {
      sent: true,
      emailId,
      messageId: delivery.messageId,
      previewUrl: delivery.previewUrl,
    };
  },
  {
    connection: emailWorkerConnection,
    concurrency: 2,
  },
);

emailWorker.on("completed", (job, result) => {
  console.log(`Email job ${job.id} completed:`, result);
});

emailWorker.on("failed", (job, error) => {
  console.error(`Email job ${job?.id ?? "unknown"} failed:`, error.message);

  if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
    return;
  }

  // Mark the email failed only after BullMQ has exhausted its retries.
  void pool
    .query(
      `UPDATE scheduled_emails
       SET status = 'failed',
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'queued'`,
      [
        job.data.emailId,
        error.message.slice(0, 5000),
      ],
    )
    .catch((dbError) => {
      console.error("Could not record final email failure:", dbError);
    });
});

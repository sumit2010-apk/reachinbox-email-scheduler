
import { randomUUID } from "node:crypto";
import { pool } from "../config/database";
import { createScheduledEmail } from "../repositories/email.repository";

async function main() {
  const idempotencyKey = `idempotency-test-${randomUUID()}`;

  const input = {
    idempotencyKey,
    recipientEmail: "Test.User@Example.com",
    subject: "Idempotency verification",
    bodyText: "This is a test email record.",
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
  };

  try {
    const first = await createScheduledEmail(input);
    const second = await createScheduledEmail(input);

    console.log("First request created:", first.created);
    console.log("Second request created:", second.created);
    console.log("Same record ID:", first.email.id === second.email.id);
    console.log("Normalized recipient:", first.email.recipient_email);

    if (
      !first.created ||
      second.created ||
      first.email.id !== second.email.id ||
      first.email.recipient_email !== "test.user@example.com"
    ) {
      throw new Error("Idempotency verification failed.");
    }

    console.log("IDEMPOTENCY TEST PASSED");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Idempotency test failed:", error);
  process.exitCode = 1;
});

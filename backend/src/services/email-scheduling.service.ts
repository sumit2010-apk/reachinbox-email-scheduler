
import { createScheduledEmail } from "../repositories/email.repository";

export interface ScheduleEmailInput {
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  scheduledAt: Date;
}

export async function scheduleEmail(input: ScheduleEmailInput) {
  if (
    !(input.scheduledAt instanceof Date) ||
    Number.isNaN(input.scheduledAt.getTime())
  ) {
    throw new Error("A valid scheduled date is required.");
  }

  if (input.scheduledAt.getTime() <= Date.now()) {
    throw new Error("Scheduled time must be in the future.");
  }

  // The repository transaction stores both the email and its outbox event.
  // A separate dispatcher publishes the outbox event to BullMQ.
  return createScheduledEmail(input);
}

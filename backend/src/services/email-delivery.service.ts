
import { emailFrom, emailTransport } from "../config/email";

export interface SendEmailInput {
  emailId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("Cannot send email: recipient address is invalid.");
  }

  if (!input.subject.trim()) {
    throw new Error("Cannot send email: subject is empty.");
  }

  if (!input.bodyText.trim()) {
    throw new Error("Cannot send email: message body is empty.");
  }

  const info = await emailTransport.sendMail({
    from: emailFrom,
    to: recipientEmail,
    subject: input.subject,
    text: input.bodyText,
    headers: {
      "X-ReachInbox-Email-ID": input.emailId,
    },
  });

  const previewUrl = emailTransport.options
    ? false
    : false;

  console.log(`Ethereal accepted email ${input.emailId}. Message ID: ${info.messageId}`);

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

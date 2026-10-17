
import nodemailer from "nodemailer";
import "dotenv/config";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM;

if (!host || !user || !pass || !from) {
  throw new Error(
    "Missing SMTP configuration. Check SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM in .env.",
  );
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("SMTP_PORT must be a valid port number.");
}

export const emailTransport = nodemailer.createTransport({
  host,
  port,
  secure: process.env.SMTP_SECURE === "true",
  auth: { user, pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

export const emailFrom = from;

export async function verifyEmailTransport(): Promise<void> {
  await emailTransport.verify();
  console.log("SMTP connection verified successfully.");
}

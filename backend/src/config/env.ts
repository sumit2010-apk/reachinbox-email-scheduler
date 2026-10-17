
import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

function readPositiveInteger(
  name: string,
  defaultValue: number,
): number {
  const value = Number(process.env[name] ?? defaultValue);

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

export const env = {
  port,
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisHost: process.env.REDIS_HOST ?? "localhost",
  redisPort: Number(process.env.REDIS_PORT ?? 6379),

  // Minimum spacing between email sends, in milliseconds.
  emailSendDelayMs: readPositiveInteger(
    "EMAIL_SEND_DELAY_MS",
    2000,
  ),

  // Maximum emails permitted in a rolling hourly window.
  emailHourlyLimit: readPositiveInteger(
    "EMAIL_HOURLY_LIMIT",
    100,
  ),
};

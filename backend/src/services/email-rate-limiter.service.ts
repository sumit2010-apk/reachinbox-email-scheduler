
import { randomUUID } from "node:crypto";
import { redis } from "../config/redis";
import { env } from "../config/env";

const RATE_LIMIT_KEY = "reachinbox:email-rate-limit:v2";
const LAST_SEND_KEY = "reachinbox:email-last-send:v2";
const HOUR_MS = 60 * 60 * 1000;

const RESERVE_SCRIPT = `
local rateKey = KEYS[1]
local lastSendKey = KEYS[2]

local now = tonumber(ARGV[1])
local hourMs = tonumber(ARGV[2])
local hourlyLimit = tonumber(ARGV[3])
local minDelayMs = tonumber(ARGV[4])
local reservationId = ARGV[5]

redis.call("ZREMRANGEBYSCORE", rateKey, "-inf", now - hourMs)

local count = redis.call("ZCARD", rateKey)
local lastSend = tonumber(redis.call("GET", lastSendKey) or "0")
local spacingWait = math.max(0, lastSend + minDelayMs - now)

if count >= hourlyLimit then
  local oldest = redis.call("ZRANGE", rateKey, 0, 0, "WITHSCORES")
  local quotaWait = 0

  if oldest[2] then
    quotaWait = math.max(0, tonumber(oldest[2]) + hourMs - now)
  end

  return {0, math.max(spacingWait, quotaWait)}
end

if spacingWait > 0 then
  return {0, spacingWait}
end

redis.call("ZADD", rateKey, now, reservationId)
redis.call("PEXPIRE", rateKey, hourMs + minDelayMs)
redis.call("SET", lastSendKey, now, "PX", hourMs + minDelayMs)

return {1, 0}
`;

export interface RateLimitReservation {
  allowed: boolean;
  waitMs: number;
  reservationId: string;
}

export async function reserveEmailSend(
  emailId: string,
): Promise<RateLimitReservation> {
  const reservationId = `${emailId}:${randomUUID()}`;

  const result = (await redis.eval(
    RESERVE_SCRIPT,
    2,
    RATE_LIMIT_KEY,
    LAST_SEND_KEY,
    Date.now(),
    HOUR_MS,
    env.emailHourlyLimit,
    env.emailSendDelayMs,
    reservationId,
  )) as [number | string, number | string];

  return {
    allowed: Number(result[0]) === 1,
    waitMs: Math.max(0, Number(result[1])),
    reservationId,
  };
}

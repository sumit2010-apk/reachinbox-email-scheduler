
import Redis from "ioredis";
import { env } from "./env";

export const redis = new Redis({
  host: env.redisHost,
  port: env.redisPort,
  password: env.redisPassword,
  tls: env.redisTls ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

redis.on("connect", () => {
  console.log("Redis connection established.");
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});

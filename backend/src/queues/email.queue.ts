
import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const emailQueue = new Queue("scheduled-emails", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

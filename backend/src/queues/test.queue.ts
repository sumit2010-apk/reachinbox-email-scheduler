
import { Queue } from "bullmq";
import { redis } from "../config/redis";

export const testQueue = new Queue("reachinbox-test", {
  connection: redis,
});

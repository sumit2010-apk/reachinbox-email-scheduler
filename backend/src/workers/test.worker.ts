
import { Worker } from "bullmq";
import { redis } from "../config/redis";

export const testWorker = new Worker(
  "reachinbox-test",
  async (job) => {
    console.log("Processing job:", job.name);
    console.log("Job data:", job.data);

    return {
      success: true,
      processedAt: new Date().toISOString(),
    };
  },
  {
    connection: redis,
    concurrency: 2,
  },
);

testWorker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

testWorker.on("failed", (job, error) => {
  console.error(`Job ${job?.id ?? "unknown"} failed:`, error.message);
});

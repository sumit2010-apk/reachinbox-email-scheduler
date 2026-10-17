
import { QueueEvents } from "bullmq";
import { testQueue } from "../queues/test.queue";
import { testWorker } from "../workers/test.worker";
import { redis } from "../config/redis";

async function main() {
  const queueEvents = new QueueEvents("reachinbox-test", {
    connection: redis.duplicate(),
  });

  try {
    await queueEvents.waitUntilReady();

    const job = await testQueue.add("connection-check", {
      message: "BullMQ is connected to Redis",
      createdAt: new Date().toISOString(),
    });

    console.log("Job added:", job.id);

    const result = await job.waitUntilFinished(queueEvents, 10_000);

    console.log("Final result:", result);
  } finally {
    await queueEvents.close();
    await testWorker.close();
    await testQueue.close();
    await redis.quit();
  }
}

main().catch((error) => {
  console.error("Queue test failed:", error);
  process.exitCode = 1;
});

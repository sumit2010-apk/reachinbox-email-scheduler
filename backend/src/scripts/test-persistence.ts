
import { Queue, Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
});

const queueName = "reachinbox-persistence-test";

async function main() {
  const queue = new Queue(queueName, { connection });
  const queueEvents = new QueueEvents(queueName, {
    connection: connection.duplicate(),
  });

  let worker: Worker | undefined;

  try {
    await queueEvents.waitUntilReady();

    // Remove leftovers from an earlier test run.
    await queue.obliterate({ force: true });

    // Add the job while no worker is running.
    const job = await queue.add(
      "restart-check",
      { message: "This job survived a worker restart" },
      { attempts: 3 },
    );

    console.log("Job queued before worker starts:", job.id);

    const waiting = await queue.getWaiting();
    console.log("Waiting jobs before worker starts:", waiting.length);

    // Start the worker after the job is safely stored in Redis.
    worker = new Worker(
      queueName,
      async (receivedJob) => {
        console.log("Worker received:", receivedJob.data.message);
        return { success: true };
      },
      { connection: connection.duplicate() },
    );

    const result = await job.waitUntilFinished(queueEvents, 10_000);
    console.log("Persistence test result:", result);
  } finally {
    if (worker) await worker.close();
    await queueEvents.close();
    await queue.close();
    await connection.quit();
  }
}

main().catch((error) => {
  console.error("Persistence test failed:", error);
  process.exitCode = 1;
});

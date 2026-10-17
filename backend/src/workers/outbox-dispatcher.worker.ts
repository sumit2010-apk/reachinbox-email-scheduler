
import { dispatchPendingOutboxEvents } from "../services/outbox-dispatcher.service";
import { pool } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { redis } from "../config/redis";

const POLL_INTERVAL_MS = 1_000;

let stopping = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let shutdownPromise: Promise<void> | undefined;

function waitForNextPoll(): Promise<void> {
  return new Promise((resolve) => {
    timer = setTimeout(() => {
      timer = undefined;
      resolve();
    }, POLL_INTERVAL_MS);
  });
}

async function runDispatcher(): Promise<void> {
  while (!stopping) {
    try {
      const published = await dispatchPendingOutboxEvents();

      if (published > 0) {
        console.log(`Outbox dispatcher published ${published} event(s).`);
      }
    } catch (error) {
      console.error("Outbox dispatcher iteration failed:", error);
    }

    if (!stopping) {
      await waitForNextPoll();
    }
  }
}

const dispatcherPromise = runDispatcher();

function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  stopping = true;
  console.log(`Received ${signal}; stopping outbox dispatcher...`);

  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }

  shutdownPromise = (async () => {
    try {
      await dispatcherPromise;
      console.log("Outbox dispatcher loop stopped.");
    } catch (error) {
      console.error("Dispatcher loop failed during shutdown:", error);
      throw error;
    } finally {
      await emailQueue.close();
      await redis.quit();
      await pool.end();
      console.log("Outbox dispatcher stopped cleanly.");
    }
  })();

  return shutdownPromise;
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").catch((error) => {
    console.error("Shutdown failed:", error);
    process.exitCode = 1;
  });
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").catch((error) => {
    console.error("Shutdown failed:", error);
    process.exitCode = 1;
  });
});

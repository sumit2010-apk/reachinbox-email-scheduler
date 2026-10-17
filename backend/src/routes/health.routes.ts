import { redis } from "../config/redis";
import { Router } from "express";
import { pool } from "../config/database";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "reachinbox-api",
    timestamp: new Date().toISOString(),
  });
});

router.get("/db", async (_req, res) => {
  try {
    const result = await pool.query<{
      database: string;
      current_time: Date;
    }>(
      "SELECT current_database() AS database, NOW() AS current_time"
    );

    res.status(200).json({
      status: "ok",
      database: result.rows[0].database,
      timestamp: result.rows[0].current_time.toISOString(),
    });
  } catch (error) {
    console.error(
      "Database health check failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    res.status(503).json({
      status: "error",
      message: "Database connection unavailable",
    });
  }
});
router.get("/redis", async (_req, res) => {
  try {
    const result = await redis.ping();

    if (result !== "PONG") {
      return res.status(503).json({
        status: "error",
        message: "Unexpected Redis response",
      });
    }

    return res.status(200).json({
      status: "ok",
      service: "redis",
      response: result,
    });
  } catch (error) {
    console.error(
      "Redis health check failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return res.status(503).json({
      status: "error",
      message: "Redis connection unavailable",
    });
  }
});

export default router;

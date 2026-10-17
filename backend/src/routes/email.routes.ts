
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { scheduleEmail } from "../services/email-scheduling.service";
import { pool } from "../config/database";
const router = Router();

router.post("/", async (req, res) => {
  const {
    recipientEmail,
    subject,
    bodyText,
    scheduledAt,
  } = req.body ?? {};

  const headerKey = req.get("Idempotency-Key");
  const idempotencyKey =
    typeof headerKey === "string" && headerKey.trim()
      ? headerKey.trim()
      : randomUUID();

  if (
    typeof recipientEmail !== "string" ||
    typeof subject !== "string" ||
    typeof bodyText !== "string" ||
    typeof scheduledAt !== "string"
  ) {
    return res.status(400).json({
      error: "recipientEmail, subject, bodyText, and scheduledAt are required.",
    });
  }

  const normalizedRecipient = recipientEmail.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipient)) {
    return res.status(400).json({
      error: "Please provide a valid recipient email address.",
    });
  }

  if (!subject.trim() || subject.trim().length > 998) {
    return res.status(400).json({
      error: "Subject must contain between 1 and 998 characters.",
    });
  }

  if (!bodyText.trim()) {
    return res.status(400).json({
      error: "Email body cannot be empty.",
    });
  }

  const parsedDate = new Date(scheduledAt);

  if (Number.isNaN(parsedDate.getTime())) {
    return res.status(400).json({
      error: "scheduledAt must be a valid ISO 8601 date string.",
    });
  }

  if (parsedDate.getTime() <= Date.now()) {
    return res.status(400).json({
      error: "scheduledAt must be in the future.",
    });
  }

  try {
    const result = await scheduleEmail({
      idempotencyKey,
      recipientEmail: normalizedRecipient,
      subject: subject.trim(),
      bodyText: bodyText.trim(),
      scheduledAt: parsedDate,
    });

    return res.status(result.created ? 201 : 200).json({
      message: result.created
        ? "Email scheduled successfully."
        : "An email with this idempotency key already exists.",
      created: result.created,
      email: result.email,
    });
  } catch (error) {
    console.error("Email scheduling failed:", error);

    return res.status(500).json({
      error: "Unable to schedule email right now.",
    });
  }
});

router.get("/", async (req, res) => {
  const allowedStatuses = [
    "scheduled",
    "queued",
    "processing",
    "sent",
    "failed",
    "cancelled",
  ];

  const statusParam = req.query.status;
  const pageParam = Number(req.query.page ?? 1);
  const limitParam = Number(req.query.limit ?? 10);

  if (
    statusParam !== undefined &&
    (typeof statusParam !== "string" ||
      !allowedStatuses.includes(statusParam))
  ) {
    return res.status(400).json({
      error: "Invalid status filter.",
      allowedStatuses,
    });
  }

  if (
    !Number.isInteger(pageParam) ||
    pageParam < 1 ||
    !Number.isInteger(limitParam) ||
    limitParam < 1 ||
    limitParam > 100
  ) {
    return res.status(400).json({
      error: "page must be at least 1 and limit must be between 1 and 100.",
    });
  }

  try {
    

    const offset = (pageParam - 1) * limitParam;
    const values: (string | number)[] = [];
    let whereClause = "";

    if (typeof statusParam === "string") {
      values.push(statusParam);
      whereClause = "WHERE status = $1";
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM scheduled_emails
       ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;

    const listValues = [...values, limitParam, offset];
    const result = await pool.query(
      `SELECT
         id,
         recipient_email AS "recipientEmail",
         subject,
         body_text AS "bodyText",
         scheduled_at AS "scheduledAt",
         status,
         attempts,
         last_error AS "lastError",
         sent_at AS "sentAt",
         created_at AS "createdAt"
       FROM scheduled_emails
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      listValues
    );

    return res.json({
      data: result.rows,
      pagination: {
        page: pageParam,
        limit: limitParam,
        total,
        totalPages: Math.ceil(total / limitParam),
      },
    });
  } catch (error) {
    console.error("Email listing failed:", error);

    return res.status(500).json({
      error: "Unable to retrieve emails right now.",
    });
  }
});


export default router;

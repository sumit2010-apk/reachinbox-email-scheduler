
import express from "express";
import cors from "cors";
import healthRoutes from "./routes/health.routes";
import emailRoutes from "./routes/email.routes";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "ReachInbox Scheduler API",
    message: "API is running.",
  });
});

app.use("/api/health", healthRoutes);
app.use("/api/emails", emailRoutes);

export default app;

import app from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`ReachInbox API running at http://localhost:${env.port}`);
});
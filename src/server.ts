import dotenv from "dotenv";
import { validateEnv } from "./config/env";

dotenv.config({ override: true });

validateEnv();
import app from "./app";
import { startRequestReminderJob } from "./jobs/requestReminders";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startRequestReminderJob();
});

import { server } from "./app";
import dotenv from "dotenv";
import cron from "node-cron";
import https from "https";
import http from "http";
import { connectRabbitMQ } from "./shared/config/rabbitmq";
import redis from "./shared/config/redis";
import { startUserWorker } from "./workers/user.worker";
import { startNotificationWorker } from "./workers/notification.worker";
import { startEmailWorker } from "./workers/email.worker";
import { startCategoryWorker } from "./workers/category.worker";
import { startSessionSchedulerWorker } from "./workers/session-scheduler.worker";
import { warmupEmailTransport } from "./shared/utils/emailService";

dotenv.config();
const PORT = process.env.PORT || 6000;

const startServer = async () => {
  try {
    await connectRabbitMQ();
    await startUserWorker();
    await startNotificationWorker();
    await startEmailWorker();
    await startCategoryWorker();
    startSessionSchedulerWorker();
    await redis.ping();
    console.log("✅ Redis ready");

    warmupEmailTransport().catch(() => {
      // non-fatal: we still start the server; first email send will retry
    });

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

const pingServer = () => {
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const client = baseUrl.startsWith("https") ? https : http;

  client
    .get(`${baseUrl}/health`, (res) => {
      console.log(
        `Ping successful at ${new Date().toISOString()}, Status: ${res.statusCode}`,
      );
    })
    .on("error", (err) => {
      console.error("Ping failed:", err.message || err);
    });
};

cron.schedule("*/14 * * * *", () => {
  console.log("Pinging server to keep it awake...");
  pingServer();
});

setTimeout(pingServer, 5000);

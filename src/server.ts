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

dotenv.config();
const PORT = process.env.PORT || 6000;

const startServer = async () => {
  try {
    await connectRabbitMQ();
    await startUserWorker();
    await startNotificationWorker();
    await startEmailWorker();
    await startCategoryWorker();
    await redis.ping();
    console.log("✅ Redis ready");

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
  const protocol = process.env.NODE_ENV === "production" ? https : http;
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

  protocol
    .get(`${baseUrl}/health`, (res) => {
      console.log(
        `Ping successful at ${new Date().toISOString()}, Status: ${res.statusCode}`,
      );
    })
    .on("error", (err) => {
      console.error("Ping failed:", err.message);
    });
};

cron.schedule("*/14 * * * *", () => {
  console.log("Pinging server to keep it awake...");
  pingServer();
});

setTimeout(pingServer, 5000);

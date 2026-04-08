"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const dotenv_1 = __importDefault(require("dotenv"));
const node_cron_1 = __importDefault(require("node-cron"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const rabbitmq_1 = require("./shared/config/rabbitmq");
const redis_1 = __importDefault(require("./shared/config/redis"));
const user_worker_1 = require("./workers/user.worker");
const notification_worker_1 = require("./workers/notification.worker");
const email_worker_1 = require("./workers/email.worker");
const category_worker_1 = require("./workers/category.worker");
dotenv_1.default.config();
const PORT = process.env.PORT || 6000;
const startServer = async () => {
    try {
        await (0, rabbitmq_1.connectRabbitMQ)();
        await (0, user_worker_1.startUserWorker)();
        await (0, notification_worker_1.startNotificationWorker)();
        await (0, email_worker_1.startEmailWorker)();
        await (0, category_worker_1.startCategoryWorker)();
        await redis_1.default.ping();
        console.log("✅ Redis ready");
        app_1.server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
        });
    }
    catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
};
startServer();
const pingServer = () => {
    const protocol = process.env.NODE_ENV === "production" ? https_1.default : http_1.default;
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    protocol
        .get(`${baseUrl}/health`, (res) => {
        console.log(`Ping successful at ${new Date().toISOString()}, Status: ${res.statusCode}`);
    })
        .on("error", (err) => {
        console.error("Ping failed:", err.message);
    });
};
node_cron_1.default.schedule("*/14 * * * *", () => {
    console.log("Pinging server to keep it awake...");
    pingServer();
});
setTimeout(pingServer, 5000);

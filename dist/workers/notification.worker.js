"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNotificationWorker = void 0;
const rabbitmq_1 = require("../shared/config/rabbitmq");
const socket_1 = require("../shared/config/socket");
const notifications_model_1 = __importDefault(require("../modules/notification/models/notifications.model"));
const startNotificationWorker = async () => {
    const channel = (0, rabbitmq_1.getChannel)();
    await channel.assertQueue("notifications", { durable: true });
    channel.consume("notifications", async (msg) => {
        if (!msg)
            return;
        const payload = JSON.parse(msg.content.toString());
        try {
            const notification = await notifications_model_1.default.create(payload);
            const io = (0, socket_1.getIO)();
            io.to(`user_${payload.userId}`).emit("new_notification", notification);
            channel.ack(msg);
        }
        catch (err) {
            console.error("Notification worker error:", err);
            channel.nack(msg, false, true);
        }
    });
    console.log("✅ Notification worker started, listening to 'notifications'");
};
exports.startNotificationWorker = startNotificationWorker;

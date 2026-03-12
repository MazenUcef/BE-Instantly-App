"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startUserWorker = void 0;
const notification_publisher_1 = require("../modules/notification/notification.publisher");
const rabbitmq_1 = require("../shared/config/rabbitmq");
const emailService_1 = require("../shared/utils/emailService");
const startUserWorker = async () => {
    const { channel } = await (0, rabbitmq_1.connectRabbitMQ)();
    channel.consume("USER_REGISTERED", async (msg) => {
        if (!msg) {
            console.log("No message received");
            return;
        }
        console.log("Worker received USER_REGISTERED message:", msg.content.toString());
        const data = JSON.parse(msg.content.toString());
        console.log("Parsed data:", data);
        try {
            await (0, emailService_1.sendEmailOTP)(data.email, data.otp);
            console.log("Email sent to:", data.email);
            await (0, notification_publisher_1.publishNotification)({
                userId: data.userId,
                type: "welcome",
                title: "Welcome 🎉",
                message: `Hi ${data.firstName}, thanks for joining!`,
            });
            channel.ack(msg);
        }
        catch (err) {
            console.error("Error processing USER_REGISTERED", err);
        }
    });
    console.log("✅ User worker started, listening to 'USER_REGISTERED'");
};
exports.startUserWorker = startUserWorker;

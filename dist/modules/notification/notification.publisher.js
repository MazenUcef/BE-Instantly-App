"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishNotification = exports.NOTIFICATION_QUEUE = void 0;
const crypto_1 = require("crypto");
const rabbitmq_1 = require("../../shared/config/rabbitmq");
exports.NOTIFICATION_QUEUE = "notifications";
const assertNotificationPayload = (payload) => {
    if (!payload.userId?.trim()) {
        throw new Error("Notification userId is required");
    }
    if (!payload.type?.trim()) {
        throw new Error("Notification type is required");
    }
    if (!payload.title?.trim()) {
        throw new Error("Notification title is required");
    }
    if (!payload.message?.trim()) {
        throw new Error("Notification message is required");
    }
};
const publishNotification = async (payload) => {
    assertNotificationPayload(payload);
    const channel = (0, rabbitmq_1.getChannel)();
    if (!channel) {
        throw new Error("RabbitMQ channel is not initialized");
    }
    const message = {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        data: payload.data ?? null,
        messageId: (0, crypto_1.randomUUID)(),
        version: 1,
        createdAt: new Date().toISOString(),
    };
    const sent = channel.sendToQueue(exports.NOTIFICATION_QUEUE, Buffer.from(JSON.stringify(message)), {
        persistent: true,
        contentType: "application/json",
        contentEncoding: "utf-8",
        messageId: message.messageId,
        timestamp: Date.now(),
        type: message.type,
    });
    if (!sent) {
        throw new Error("Failed to enqueue notification message");
    }
    return message;
};
exports.publishNotification = publishNotification;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishNotification = void 0;
const rabbitmq_1 = require("../../shared/config/rabbitmq");
const publishNotification = async (payload) => {
    const channel = (0, rabbitmq_1.getChannel)();
    channel.sendToQueue("notifications", Buffer.from(JSON.stringify(payload)), { persistent: true });
};
exports.publishNotification = publishNotification;

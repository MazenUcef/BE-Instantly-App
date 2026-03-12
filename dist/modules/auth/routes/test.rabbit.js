"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rabbitmq_1 = require("../../../shared/config/rabbitmq");
const router = (0, express_1.Router)();
router.get('/rabbit', async (_, res) => {
    const { channel } = await (0, rabbitmq_1.connectRabbitMQ)();
    const queue = 'test_queue';
    await channel.assertQueue(queue);
    channel.sendToQueue(queue, Buffer.from(JSON.stringify({
        event: 'TEST_EVENT',
        message: 'Hello RabbitMQ',
    })));
    res.json({ rabbitmq: 'message sent' });
});
exports.default = router;

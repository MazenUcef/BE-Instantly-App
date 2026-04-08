"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannel = exports.publishToQueue = exports.connectRabbitMQ = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
let channel;
const connectRabbitMQ = async () => {
    const connection = await amqplib_1.default.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue("USER_REGISTERED", { durable: true });
    await channel.assertQueue("notifications", { durable: true });
    await channel.assertQueue("email_jobs", { durable: true });
    console.log("✅ RabbitMQ connected");
    return { connection, channel };
};
exports.connectRabbitMQ = connectRabbitMQ;
const publishToQueue = async (queue, message) => {
    const ch = (0, exports.getChannel)();
    await ch.assertQueue(queue, { durable: true });
    const sent = ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
    console.log(`Message sent to ${queue}: ${sent}`);
};
exports.publishToQueue = publishToQueue;
const getChannel = () => {
    if (!channel)
        throw new Error("RabbitMQ not initialized");
    return channel;
};
exports.getChannel = getChannel;

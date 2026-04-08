"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCategoryWorker = void 0;
const rabbitmq_1 = require("../shared/config/rabbitmq");
const User_model_1 = __importDefault(require("../modules/auth/models/User.model"));
const notification_publisher_1 = require("../modules/notification/notification.publisher");
const startCategoryWorker = async () => {
    const channel = (0, rabbitmq_1.getChannel)();
    await channel.assertQueue("CATEGORY_CREATED", { durable: true });
    channel.consume("CATEGORY_CREATED", async (msg) => {
        if (!msg)
            return;
        const payload = JSON.parse(msg.content.toString());
        try {
            const { categoryId, name, jobs } = payload;
            const customers = await User_model_1.default.find({ role: "customer" }).select("_id");
            await Promise.all(customers.map((customer) => (0, notification_publisher_1.publishNotification)({
                userId: customer._id.toString(),
                type: "NEW_CATEGORY_CREATED",
                title: "New Category Available 🎉",
                message: `A new category "${name}" is now available.`,
                data: { categoryId, jobs },
            })));
            channel.ack(msg);
        }
        catch (err) {
            console.error("Category worker error:", err);
            channel.nack(msg, false, true);
        }
    });
    console.log("✅ Category worker started...");
};
exports.startCategoryWorker = startCategoryWorker;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.markAsRead = exports.getUserNotifications = exports.createNotification = void 0;
const notifications_model_1 = __importDefault(require("../models/notifications.model"));
const socket_1 = require("../../../shared/config/socket");
const createNotification = async (req, res) => {
    try {
        const { userId, type, title, message, data } = req.body;
        const notification = await notifications_model_1.default.create({
            userId,
            type,
            title,
            message,
            data,
        });
        const io = (0, socket_1.getIO)();
        io.to(`user_${userId}`).emit("new_notification", notification);
        res.status(201).json(notification);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to create notification" });
    }
};
exports.createNotification = createNotification;
const getUserNotifications = async (req, res) => {
    try {
        const userId = req?.user?.userId;
        const notifications = await notifications_model_1.default
            .find({ userId })
            .sort({ createdAt: -1 });
        res.json({ count: notifications.length, notifications });
    }
    catch (error) {
        console.log("error", error);
        res.status(500).json({ message: "Failed to fetch notifications" });
    }
};
exports.getUserNotifications = getUserNotifications;
const markAsRead = async (req, res) => {
    try {
        const notification = await notifications_model_1.default.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }
        res.json(notification);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to update notification" });
    }
};
exports.markAsRead = markAsRead;
const markAllAsRead = async (req, res) => {
    try {
        const userId = req?.user?.userId;
        await notifications_model_1.default.updateMany({ userId, isRead: false }, { isRead: true });
        res.json({ message: "All notifications marked as read" });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to update notifications" });
    }
};
exports.markAllAsRead = markAllAsRead;

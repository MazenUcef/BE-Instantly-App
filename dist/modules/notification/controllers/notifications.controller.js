"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllAsRead = exports.markAsRead = exports.getUserNotifications = exports.createNotification = void 0;
const notification_service_1 = require("../services/notification.service");
const createNotification = async (req, res) => {
    const result = await notification_service_1.NotificationService.createNotification({
        actorUserId: req.user.userId,
        actorRole: req.user.role,
        userId: req.body.userId,
        type: req.body.type,
        title: req.body.title,
        message: req.body.message,
        data: req.body.data,
        internal: false,
    });
    return res.status(201).json(result);
};
exports.createNotification = createNotification;
const getUserNotifications = async (req, res) => {
    const result = await notification_service_1.NotificationService.getUserNotifications({
        userId: req.user.userId,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
    });
    return res.status(200).json(result);
};
exports.getUserNotifications = getUserNotifications;
const markAsRead = async (req, res) => {
    const result = await notification_service_1.NotificationService.markAsRead({
        notificationId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.markAsRead = markAsRead;
const markAllAsRead = async (req, res) => {
    const result = await notification_service_1.NotificationService.markAllAsRead({
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.markAllAsRead = markAllAsRead;

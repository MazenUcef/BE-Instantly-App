"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const notification_repository_1 = require("../repositories/notification.repository");
const notification_event_service_1 = require("./notification-event.service");
class NotificationService {
    static async createNotification(input) {
        const { actorUserId, actorRole, userId, type, title, message, data, internal = false, } = input;
        if (!internal && actorUserId !== userId) {
            throw new errorHandler_1.AppError("Not allowed to create notifications for another user", 403);
        }
        const dbSession = await mongoose_1.default.startSession();
        let notification;
        try {
            await dbSession.withTransaction(async () => {
                notification = await notification_repository_1.NotificationRepository.createNotification({
                    userId,
                    type,
                    title,
                    message,
                    data: data || null,
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const unreadCount = await notification_repository_1.NotificationRepository.countUnreadByUserId(userId);
        notification_event_service_1.NotificationEventService.emitNotificationCreated(notification, unreadCount);
        return {
            success: true,
            message: "Notification created successfully",
            data: notification,
            unreadCount,
        };
    }
    static async getUserNotifications(input) {
        const { userId, page = 1, limit = 20 } = input;
        const [notifications, total, unreadCount] = await Promise.all([
            notification_repository_1.NotificationRepository.findByUserId(userId, page, limit),
            notification_repository_1.NotificationRepository.countByUserId(userId),
            notification_repository_1.NotificationRepository.countUnreadByUserId(userId),
        ]);
        return {
            success: true,
            count: notifications.length,
            total,
            unreadCount,
            page,
            limit,
            notifications,
        };
    }
    static async markAsRead(input) {
        const { notificationId, userId } = input;
        const notification = await notification_repository_1.NotificationRepository.findById(notificationId);
        if (!notification) {
            throw new errorHandler_1.AppError("Notification not found", 404);
        }
        if (notification.userId.toString() !== userId) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        if (notification.isRead) {
            const unreadCount = await notification_repository_1.NotificationRepository.countUnreadByUserId(userId);
            return {
                success: true,
                message: "Notification already marked as read",
                data: notification,
                unreadCount,
            };
        }
        const updated = await notification_repository_1.NotificationRepository.markAsRead(notificationId, userId);
        if (!updated) {
            throw new errorHandler_1.AppError("Failed to mark notification as read", 409);
        }
        const unreadCount = await notification_repository_1.NotificationRepository.countUnreadByUserId(userId);
        notification_event_service_1.NotificationEventService.emitNotificationRead(userId, notificationId, unreadCount);
        return {
            success: true,
            message: "Notification marked as read",
            data: updated,
            unreadCount,
        };
    }
    static async markAllAsRead(input) {
        const { userId } = input;
        const dbSession = await mongoose_1.default.startSession();
        try {
            await dbSession.withTransaction(async () => {
                await notification_repository_1.NotificationRepository.markAllAsRead(userId, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        notification_event_service_1.NotificationEventService.emitAllNotificationsRead(userId, 0);
        return {
            success: true,
            message: "All notifications marked as read",
            unreadCount: 0,
        };
    }
}
exports.NotificationService = NotificationService;

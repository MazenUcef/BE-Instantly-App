"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
class NotificationEventService {
    static emitNotificationCreated(notification, unreadCount) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(notification.userId.toString())).emit(socket_1.socketEvents.NEW_NOTIFICATION, {
            notification,
            unreadCount,
        });
    }
    static emitNotificationRead(userId, notificationId, unreadCount) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(userId)).emit(socket_1.socketEvents.NOTIFICATION_READ, {
            notificationId,
            unreadCount,
            timestamp: new Date(),
        });
    }
    static emitAllNotificationsRead(userId, unreadCount = 0) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(userId)).emit(socket_1.socketEvents.NOTIFICATIONS_ALL_READ, {
            unreadCount,
            timestamp: new Date(),
        });
    }
}
exports.NotificationEventService = NotificationEventService;

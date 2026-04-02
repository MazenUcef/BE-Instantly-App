import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";

export class NotificationEventService {
  static emitNotificationCreated(notification: any, unreadCount?: number) {
    const io = getIO();

    io.to(socketRooms.user(notification.userId.toString())).emit(
      socketEvents.NEW_NOTIFICATION,
      {
        notification,
        unreadCount,
      },
    );
  }

  static emitNotificationRead(userId: string, notificationId: string, unreadCount?: number) {
    const io = getIO();

    io.to(socketRooms.user(userId)).emit(
      socketEvents.NOTIFICATION_READ,
      {
        notificationId,
        unreadCount,
        timestamp: new Date(),
      },
    );
  }

  static emitAllNotificationsRead(userId: string, unreadCount = 0) {
    const io = getIO();

    io.to(socketRooms.user(userId)).emit(
      socketEvents.NOTIFICATIONS_ALL_READ,
      {
        unreadCount,
        timestamp: new Date(),
      },
    );
  }
}
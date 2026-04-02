import mongoose from "mongoose";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { NotificationRepository } from "../repositories/notification.repository";
import { NotificationEventService } from "./notification-event.service";

export class NotificationService {
  static async createNotification(input: {
    actorUserId: string;
    actorRole?: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, any> | null;
    internal?: boolean;
  }) {
    const {
      actorUserId,
      actorRole,
      userId,
      type,
      title,
      message,
      data,
      internal = false,
    } = input;

    if (!internal && actorUserId !== userId) {
      throw new AppError(
        "Not allowed to create notifications for another user",
        403,
      );
    }

    const dbSession = await mongoose.startSession();
    let notification: any;

    try {
      await dbSession.withTransaction(async () => {
        notification = await NotificationRepository.createNotification(
          {
            userId,
            type,
            title,
            message,
            data: data || null,
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    const unreadCount = await NotificationRepository.countUnreadByUserId(userId);

    NotificationEventService.emitNotificationCreated(
      notification,
      unreadCount,
    );

    return {
      success: true,
      message: "Notification created successfully",
      data: notification,
      unreadCount,
    };
  }

  static async getUserNotifications(input: {
    userId: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, page = 1, limit = 20 } = input;

    const [notifications, total, unreadCount] = await Promise.all([
      NotificationRepository.findByUserId(userId, page, limit),
      NotificationRepository.countByUserId(userId),
      NotificationRepository.countUnreadByUserId(userId),
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

  static async markAsRead(input: {
    notificationId: string;
    userId: string;
  }) {
    const { notificationId, userId } = input;

    const notification = await NotificationRepository.findById(notificationId);

    if (!notification) {
      throw new AppError("Notification not found", 404);
    }

    if (notification.userId.toString() !== userId) {
      throw new AppError("Not allowed", 403);
    }

    if (notification.isRead) {
      const unreadCount = await NotificationRepository.countUnreadByUserId(userId);

      return {
        success: true,
        message: "Notification already marked as read",
        data: notification,
        unreadCount,
      };
    }

    const updated = await NotificationRepository.markAsRead(
      notificationId,
      userId,
    );

    if (!updated) {
      throw new AppError("Failed to mark notification as read", 409);
    }

    const unreadCount = await NotificationRepository.countUnreadByUserId(userId);

    NotificationEventService.emitNotificationRead(
      userId,
      notificationId,
      unreadCount,
    );

    return {
      success: true,
      message: "Notification marked as read",
      data: updated,
      unreadCount,
    };
  }

  static async markAllAsRead(input: {
    userId: string;
  }) {
    const { userId } = input;

    const dbSession = await mongoose.startSession();

    try {
      await dbSession.withTransaction(async () => {
        await NotificationRepository.markAllAsRead(userId, dbSession);
      });
    } finally {
      await dbSession.endSession();
    }

    NotificationEventService.emitAllNotificationsRead(userId, 0);

    return {
      success: true,
      message: "All notifications marked as read",
      unreadCount: 0,
    };
  }
}
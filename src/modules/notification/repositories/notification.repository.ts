import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

export class NotificationRepository {
  static createNotification(
    data: {
      userId: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, any> | null;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: (data.data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  static findById(notificationId: string, tx?: Tx) {
    return (tx ?? prisma).notification.findUnique({
      where: { id: notificationId },
    });
  }

  static findByUserId(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
  }

  static countByUserId(userId: string) {
    return prisma.notification.count({ where: { userId } });
  }

  static countUnreadByUserId(userId: string) {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  static async markAsRead(notificationId: string, userId: string, tx?: Tx) {
    const result = await (tx ?? prisma).notification.updateMany({
      where: { id: notificationId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) return null;
    return (tx ?? prisma).notification.findUnique({
      where: { id: notificationId },
    });
  }

  static markAllAsRead(userId: string, tx?: Tx) {
    return (tx ?? prisma).notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
}

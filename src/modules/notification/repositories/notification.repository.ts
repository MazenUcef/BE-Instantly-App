import { ClientSession, Types } from "mongoose";
import notificationsModel from "../models/notifications.model";

export class NotificationRepository {
  static createNotification(
    data: {
      userId: Types.ObjectId | string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, any> | null;
    },
    session?: ClientSession,
  ) {
    return notificationsModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findById(
    notificationId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return notificationsModel.findById(notificationId).session(session || null);
  }

  static findByUserId(
    userId: Types.ObjectId | string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    return notificationsModel.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  static countByUserId(userId: Types.ObjectId | string) {
    return notificationsModel.countDocuments({ userId });
  }

  static countUnreadByUserId(userId: Types.ObjectId | string) {
    return notificationsModel.countDocuments({
      userId,
      isRead: false,
    });
  }

  static markAsRead(
    notificationId: Types.ObjectId | string,
    userId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return notificationsModel.findOneAndUpdate(
      {
        _id: notificationId,
        userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static markAllAsRead(
    userId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return notificationsModel.updateMany(
      {
        userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { session },
    );
  }
}
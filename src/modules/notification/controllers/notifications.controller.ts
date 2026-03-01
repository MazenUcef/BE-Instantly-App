import { Request, Response } from "express";
import notificationsModel from "../models/notifications.model";
import { getIO } from "../../../shared/config/socket";
import { IAuthRequest } from "../../../shared/types";

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { userId, type, title, message, data } = req.body;

    const notification = await notificationsModel.create({
      userId,
      type,
      title,
      message,
      data,
    });

    const io = getIO();

    io.to(`user_${userId}`).emit("new_notification", notification);

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: "Failed to create notification" });
  }
};

export const getUserNotifications = async (
  req: IAuthRequest,
  res: Response,
) => {
  try {
    const userId = req?.user?.userId;

    const notifications = await notificationsModel
      .find({ userId })
      .sort({ createdAt: -1 });

    res.json({ count: notifications.length, notifications });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const notification = await notificationsModel.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: "Failed to update notification" });
  }
};

export const markAllAsRead = async (req: IAuthRequest, res: Response) => {
  try {
    const userId = req?.user?.userId;

    await notificationsModel.updateMany(
      { userId, isRead: false },
      { isRead: true },
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update notifications" });
  }
};

export const broadcastNotification = async (
  req: IAuthRequest,
  res: Response,
) => {
  try {
    const { type, title, message, data } = req.body;

    const io = getIO();

    io.emit("new_notification", {
      type,
      title,
      message,
      data,
      createdAt: new Date(),
    });

    res.json({ message: "Broadcast sent successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to broadcast" });
  }
};

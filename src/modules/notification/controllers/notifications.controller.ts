import { Response } from "express";
import { NotificationService } from "../services/notification.service";
import { IAuthRequest } from "../../../shared/types";

export const createNotification = async (req: IAuthRequest, res: Response) => {
  const result = await NotificationService.createNotification({
    actorUserId: req.user!.userId,
    actorRole: req.user!.role,
    userId: req.body.userId,
    type: req.body.type,
    title: req.body.title,
    message: req.body.message,
    data: req.body.data,
    internal: false,
  });

  return res.status(201).json(result);
};

export const getUserNotifications = async (
  req: IAuthRequest,
  res: Response,
) => {
  const result = await NotificationService.getUserNotifications({
    userId: req.user!.userId,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });

  return res.status(200).json(result);
};

export const markAsRead = async (req: IAuthRequest, res: Response) => {
  const result = await NotificationService.markAsRead({
    notificationId: Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    userId: req.user!.userId,
  });

  return res.status(200).json(result);
};

export const markAllAsRead = async (req: IAuthRequest, res: Response) => {
  const result = await NotificationService.markAllAsRead({
    userId: req.user!.userId,
  });

  return res.status(200).json(result);
};
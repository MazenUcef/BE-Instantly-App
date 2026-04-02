import { Router } from "express";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  validateCreateNotification,
  validateNotificationIdParam,
  validateNotificationListQuery,
} from "../validators/notification.validation";
import { createNotification, getUserNotifications, markAllAsRead, markAsRead } from "../controllers/notifications.controller";

const router = Router();

router.post(
  "/",
  authenticate,
  validateCreateNotification,
  createNotification,
);

router.get(
  "/",
  authenticate,
  validateNotificationListQuery,
  getUserNotifications,
);

router.patch(
  "/:id/read",
  authenticate,
  validateNotificationIdParam,
  markAsRead,
);

router.patch(
  "/read-all",
  authenticate,
  markAllAsRead,
);

export default router;
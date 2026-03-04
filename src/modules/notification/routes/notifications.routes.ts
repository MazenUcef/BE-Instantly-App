import { Router } from "express";
import { createNotification, getUserNotifications, markAllAsRead, markAsRead } from "../controllers/notifications.controller";
import { authenticate } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/", authenticate, createNotification);
router.get("/", authenticate, getUserNotifications);
router.put("/:id/read", authenticate, markAsRead);
router.put("/read-all", authenticate, markAllAsRead);

export default router;
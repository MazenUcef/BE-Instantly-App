import { Router } from "express";
import { broadcastNotification, createNotification, getUserNotifications, markAllAsRead, markAsRead } from "../controllers/notifications.controller";
import { authenticate } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/", authenticate, createNotification);
router.get("/", authenticate, getUserNotifications);
router.put("/:id/read", authenticate, markAsRead);
router.put("/read-all", authenticate, markAllAsRead);
router.post("/broadcast", authenticate, broadcastNotification);

export default router;
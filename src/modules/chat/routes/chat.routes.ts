import express from "express";
import {
  sendMessage,
  getMessagesBySession,
  markMessagesAsRead,
} from "../controllers/chat.controller";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  validateSendMessage,
  validateGetMessagesBySession,
  validateMarkMessagesAsRead,
} from "../validators/chat.validation";

const router = express.Router();

router.post("/", authenticate, validateSendMessage, sendMessage);

router.get(
  "/:sessionId",
  authenticate,
  validateGetMessagesBySession,
  getMessagesBySession,
);

router.patch(
  "/:sessionId/read",
  authenticate,
  validateMarkMessagesAsRead,
  markMessagesAsRead,
);

export default router;
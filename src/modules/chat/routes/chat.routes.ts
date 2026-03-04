import express from "express";
import {
  sendMessage,
  getMessagesBySession,
} from "../controllers/chat.controller";
import { authenticate } from "../../../shared/middlewares/auth";

const router = express.Router();

router.post("/", authenticate, sendMessage);
router.get("/:sessionId", authenticate, getMessagesBySession);

export default router;
import { Router } from "express";
import {
  createSession,
  getSessionById,
  getActiveSessionForUser,
  updateSessionStatus,
  completeSession,
  getSessionByOrder,
  confirmSessionPayment,
} from "../controllers/session.controller";
import { authenticate } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/", authenticate, createSession);

router.patch("/:id/status", authenticate, updateSessionStatus);

router.patch("/:id/complete", authenticate, completeSession);

router.patch("/:sessionId/confirm-payment", authenticate, confirmSessionPayment);

router.get("/active/:userId", authenticate, getActiveSessionForUser);

router.get("/by-order/:orderId", authenticate, getSessionByOrder);

router.get("/:id", authenticate, getSessionById);

export default router;

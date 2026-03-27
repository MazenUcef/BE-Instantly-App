import { Router } from "express";
import {
  createSession,
  getSessionById,
  getActiveSessionForUser,
  updateSessionStatus,
  completeSession,
  getSessionByOrder,
} from "../controllers/session.controller";
import { authenticate } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/", authenticate, createSession);

router.get("/active/:userId", authenticate, getActiveSessionForUser);

router.get("/:id", authenticate, getSessionById);

router.patch("/:id/status", authenticate, updateSessionStatus);

router.patch("/:id/complete", authenticate, completeSession);

router.get("/by-order/:orderId", authenticate, getSessionByOrder);

export default router;

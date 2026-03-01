import { Router } from "express";
import {
  createSession,
  getSessionById,
  getActiveSessionForUser,
  updateSessionStatus,
  completeSession,
  getSessionByOrder,
} from "../controllers/session.controller";

const router = Router();


router.post("/", createSession);

router.get("/active/:userId", getActiveSessionForUser);

router.get("/:id", getSessionById);


router.patch("/:id/status", updateSessionStatus);

router.patch("/:id/complete", completeSession);

router.get("/by-order/:orderId", getSessionByOrder);

export default router;
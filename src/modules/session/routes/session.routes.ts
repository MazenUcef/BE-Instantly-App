import { Router } from "express";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  createSession,
  getSessionById,
  getActiveSessionForUser,
  updateSessionStatus,
  completeSession,
  getSessionByOrder,
  confirmSessionPayment,
  getResumeSessionForUser,
} from "../controllers/session.controller";
import {
  validateCreateSession,
  validateSessionIdParam,
  validateSessionPaymentParam,
  validateOrderIdParam,
  validateUserIdParam,
  validateUpdateSessionStatus,
} from "../validators/session.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  validateCreateSession,
  createSession,
);

router.patch(
  "/:id/status",
  authenticate,
  validateUpdateSessionStatus,
  updateSessionStatus,
);

router.patch(
  "/:id/complete",
  authenticate,
  validateSessionIdParam,
  completeSession,
);

router.patch(
  "/:sessionId/confirm-payment",
  authenticate,
  validateSessionPaymentParam,
  confirmSessionPayment,
);

router.get(
  "/active/:userId",
  authenticate,
  validateUserIdParam,
  getActiveSessionForUser,
);

router.get(
  "/by-order/:orderId",
  authenticate,
  validateOrderIdParam,
  getSessionByOrder,
);

router.get(
  "/resume/:userId",
  authenticate,
  validateUserIdParam,
  getResumeSessionForUser,
);

router.get(
  "/:id",
  authenticate,
  validateSessionIdParam,
  getSessionById,
);

export default router;
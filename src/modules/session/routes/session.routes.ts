import { Router } from "express";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  getSessionById,
  getActiveSessionForUser,
  updateSessionStatus,
  completeSession,
  getSessionByOrder,
  getSessionByBundleBooking,
  confirmSessionPayment,
  getResumeSessionForUser,
} from "../controllers/session.controller";
import {
  validateSessionIdParam,
  validateSessionPaymentParam,
  validateOrderIdParam,
  validateUserIdParam,
  validateUpdateSessionStatus,
} from "../validators/session.validation";

const router = Router();

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
  "/by-booking/:bundleBookingId",
  authenticate,
  getSessionByBundleBooking,
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
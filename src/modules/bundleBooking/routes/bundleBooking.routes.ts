import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  createBundleBooking,
  getSupplierBookings,
  getCustomerBookings,
  getBookingById,
  acceptBundleBooking,
  rejectBundleBooking,
  proposeTime,
  acceptProposal,
  startBundleBooking,
  markBundleBookingDone,
  confirmBundlePayment,
  cancelBundleBooking,
} from "../controllers/bundleBooking.controller";
import {
  validateBookingIdParam,
  validateBookingStatusQuery,
  validateCreateBundleBooking,
  validateRejectBooking,
  validateProposeTime,
} from "../validators/bundleBooking.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("customer"),
  validateCreateBundleBooking,
  createBundleBooking,
);

router.get(
  "/supplier",
  authenticate,
  authorize("supplier"),
  validateBookingStatusQuery,
  getSupplierBookings,
);

router.get(
  "/customer",
  authenticate,
  authorize("customer"),
  validateBookingStatusQuery,
  getCustomerBookings,
);

router.get("/:id", authenticate, validateBookingIdParam, getBookingById);

// Supplier accepts the customer's requested time
router.patch(
  "/:id/accept",
  authenticate,
  authorize("supplier"),
  validateBookingIdParam,
  acceptBundleBooking,
);

// Supplier rejects the booking entirely
router.patch(
  "/:id/reject",
  authenticate,
  authorize("supplier"),
  validateRejectBooking,
  rejectBundleBooking,
);

// Either party proposes a different time (negotiation)
router.patch(
  "/:id/propose-time",
  authenticate,
  validateProposeTime,
  proposeTime,
);

// Either party accepts the other's proposed time
router.patch(
  "/:id/accept-proposal",
  authenticate,
  validateBookingIdParam,
  acceptProposal,
);

router.patch(
  "/:id/start",
  authenticate,
  authorize("supplier"),
  validateBookingIdParam,
  startBundleBooking,
);

router.patch(
  "/:id/done",
  authenticate,
  authorize("supplier"),
  validateBookingIdParam,
  markBundleBookingDone,
);

router.patch(
  "/:id/confirm-payment",
  authenticate,
  authorize("supplier"),
  validateBookingIdParam,
  confirmBundlePayment,
);

router.patch(
  "/:id/cancel",
  authenticate,
  validateBookingIdParam,
  cancelBundleBooking,
);

export default router;

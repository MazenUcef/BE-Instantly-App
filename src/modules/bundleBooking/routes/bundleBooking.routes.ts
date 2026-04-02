import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  createBundleBooking,
  getSupplierBookings,
  getCustomerBookings,
  getBookingById,
  acceptBundleBooking,
  rejectBundleBooking,
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

router.patch(
  "/:id/accept",
  authenticate,
  authorize("supplier"),
  validateBookingIdParam,
  acceptBundleBooking,
);

router.patch(
  "/:id/reject",
  authenticate,
  authorize("supplier"),
  validateRejectBooking,
  rejectBundleBooking,
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

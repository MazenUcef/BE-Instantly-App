import {
  BUNDLE_BOOKING_STATUS,
  BUNDLE_BOOKING_TERMINAL_STATUSES,
  BUNDLE_BOOKING_TRANSITIONS,
  BundleBookingStatus,
} from "../../../shared/constants/bundleBooking.constants";
import { AppError } from "../../../shared/middlewares/errorHandler";

export const assertValidBookingTransition = (
  currentStatus: BundleBookingStatus,
  nextStatus: BundleBookingStatus,
) => {
  const allowed = BUNDLE_BOOKING_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Invalid booking status transition from "${currentStatus}" to "${nextStatus}"`,
      400,
    );
  }
};

export const isBookingTerminal = (status: BundleBookingStatus) => {
  return (BUNDLE_BOOKING_TERMINAL_STATUSES as readonly BundleBookingStatus[]).includes(status);
};

export const canCancelBooking = (status: BundleBookingStatus) => {
  return !isBookingTerminal(status);
};

export const canSupplierAcceptBooking = (status: BundleBookingStatus) => {
  return status === BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL;
};

export const canSupplierRejectBooking = (status: BundleBookingStatus) => {
  return status === BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL;
};

export const canSupplierStartBooking = (status: BundleBookingStatus) => {
  return status === BUNDLE_BOOKING_STATUS.ACCEPTED;
};

export const canSupplierMarkDone = (status: BundleBookingStatus) => {
  return status === BUNDLE_BOOKING_STATUS.IN_PROGRESS;
};

export const canConfirmBookingPayment = (status: BundleBookingStatus) => {
  return status === BUNDLE_BOOKING_STATUS.DONE;
};

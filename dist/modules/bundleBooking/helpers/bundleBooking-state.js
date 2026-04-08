"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canConfirmBookingPayment = exports.canSupplierMarkDone = exports.canSupplierStartBooking = exports.canSupplierRejectBooking = exports.canSupplierAcceptBooking = exports.canCancelBooking = exports.isBookingTerminal = exports.assertValidBookingTransition = void 0;
const bundleBooking_constants_1 = require("../../../shared/constants/bundleBooking.constants");
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const assertValidBookingTransition = (currentStatus, nextStatus) => {
    const allowed = bundleBooking_constants_1.BUNDLE_BOOKING_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
        throw new errorHandler_1.AppError(`Invalid booking status transition from "${currentStatus}" to "${nextStatus}"`, 400);
    }
};
exports.assertValidBookingTransition = assertValidBookingTransition;
const isBookingTerminal = (status) => {
    return bundleBooking_constants_1.BUNDLE_BOOKING_TERMINAL_STATUSES.includes(status);
};
exports.isBookingTerminal = isBookingTerminal;
const canCancelBooking = (status) => {
    return !(0, exports.isBookingTerminal)(status);
};
exports.canCancelBooking = canCancelBooking;
const canSupplierAcceptBooking = (status) => {
    return status === bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL;
};
exports.canSupplierAcceptBooking = canSupplierAcceptBooking;
const canSupplierRejectBooking = (status) => {
    return status === bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL;
};
exports.canSupplierRejectBooking = canSupplierRejectBooking;
const canSupplierStartBooking = (status) => {
    return status === bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.ACCEPTED;
};
exports.canSupplierStartBooking = canSupplierStartBooking;
const canSupplierMarkDone = (status) => {
    return status === bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.IN_PROGRESS;
};
exports.canSupplierMarkDone = canSupplierMarkDone;
const canConfirmBookingPayment = (status) => {
    return status === bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.DONE;
};
exports.canConfirmBookingPayment = canConfirmBookingPayment;

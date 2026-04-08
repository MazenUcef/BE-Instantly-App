"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelBundleBooking = exports.confirmBundlePayment = exports.markBundleBookingDone = exports.startBundleBooking = exports.rejectBundleBooking = exports.acceptBundleBooking = exports.getBookingById = exports.getCustomerBookings = exports.getSupplierBookings = exports.createBundleBooking = void 0;
const bundleBooking_service_1 = require("../services/bundleBooking.service");
const createBundleBooking = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.createBundleBooking({
        customerId: req.user.userId,
        bundleId: req.body.bundleId,
        governmentId: req.body.governmentId,
        address: req.body.address,
        notes: req.body.notes,
        bookedDate: req.body.bookedDate,
        slotStart: req.body.slotStart,
        slotEnd: req.body.slotEnd,
        scheduledAt: req.body.scheduledAt,
    });
    return res.status(201).json(result);
};
exports.createBundleBooking = createBundleBooking;
const getSupplierBookings = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.getSupplierBookings({
        supplierId: req.user.userId,
        status: req.query.status,
    });
    return res.status(200).json(result);
};
exports.getSupplierBookings = getSupplierBookings;
const getCustomerBookings = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.getCustomerBookings({
        customerId: req.user.userId,
        status: req.query.status,
    });
    return res.status(200).json(result);
};
exports.getCustomerBookings = getCustomerBookings;
const getBookingById = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.getBookingById({
        bookingId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getBookingById = getBookingById;
const acceptBundleBooking = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.acceptBundleBooking({
        bookingId: req.params.id,
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.acceptBundleBooking = acceptBundleBooking;
const rejectBundleBooking = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.rejectBundleBooking({
        bookingId: req.params.id,
        supplierId: req.user.userId,
        rejectionReason: req.body.rejectionReason,
    });
    return res.status(200).json(result);
};
exports.rejectBundleBooking = rejectBundleBooking;
const startBundleBooking = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.startBundleBooking({
        bookingId: req.params.id,
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.startBundleBooking = startBundleBooking;
const markBundleBookingDone = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.markBundleBookingDone({
        bookingId: req.params.id,
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.markBundleBookingDone = markBundleBookingDone;
const confirmBundlePayment = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.confirmBundlePayment({
        bookingId: req.params.id,
        supplierId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.confirmBundlePayment = confirmBundlePayment;
const cancelBundleBooking = async (req, res) => {
    const result = await bundleBooking_service_1.BundleBookingService.cancelBundleBooking({
        bookingId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.cancelBundleBooking = cancelBundleBooking;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleBookingService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const bundleBooking_model_1 = __importDefault(require("../models/bundleBooking.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const bundle_model_1 = __importDefault(require("../../bundle/models/bundle.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const bundleBooking_repository_1 = require("../repositories/bundleBooking.repository");
const calendar_1 = require("../../../shared/utils/calendar");
const bundleBooking_constants_1 = require("../../../shared/constants/bundleBooking.constants");
const bundleBooking_events_service_1 = require("./bundleBooking-events.service");
const buildBundleBookingPayload = async (bookingId) => {
    const booking = await bundleBooking_model_1.default.findById(bookingId).lean();
    if (!booking)
        return null;
    const [bundle, supplier, customer] = await Promise.all([
        bundle_model_1.default.findById(booking.bundleId).lean(),
        User_model_1.default.findById(booking.supplierId)
            .select("-password -refreshToken -biometrics")
            .lean(),
        User_model_1.default.findById(booking.customerId)
            .select("-password -refreshToken -biometrics")
            .lean(),
    ]);
    return {
        ...booking,
        bundle,
        supplier,
        customer,
    };
};
class BundleBookingService {
    static async ensureSlotAvailable(input) {
        const existing = await bundleBooking_repository_1.BundleBookingRepository.findOverlappingSupplierBookings({
            supplierId: input.supplierId,
            bookedDate: input.bookedDate,
            statuses: bundleBooking_constants_1.BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES,
        });
        for (const booking of existing) {
            if (input.excludeBookingId &&
                String(booking._id) === String(input.excludeBookingId)) {
                continue;
            }
            if ((0, calendar_1.overlapsTimeRange)(input.slotStart, input.slotEnd, booking.slotStart, booking.slotEnd)) {
                return false;
            }
        }
        return true;
    }
    static async getBookingForActor(bookingId, userId) {
        const booking = await bundleBooking_repository_1.BundleBookingRepository.findById(bookingId);
        if (!booking) {
            throw new errorHandler_1.AppError("Booking not found", 404);
        }
        const isCustomer = String(booking.customerId) === String(userId);
        const isSupplier = String(booking.supplierId) === String(userId);
        if (!isCustomer && !isSupplier) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        return { booking, isCustomer, isSupplier };
    }
    static async createBundleBooking(input) {
        const { customerId, bundleId, governmentId, address, notes, bookedDate, slotStart, slotEnd, scheduledAt, } = input;
        if (slotStart >= slotEnd) {
            throw new errorHandler_1.AppError("slotStart must be before slotEnd", 400);
        }
        const bundle = await bundle_model_1.default.findById(bundleId);
        if (!bundle || !bundle.isActive) {
            throw new errorHandler_1.AppError("Bundle not found or inactive", 404);
        }
        if (String(bundle.supplierId) === String(customerId)) {
            throw new errorHandler_1.AppError("You cannot book your own bundle", 400);
        }
        const dbSession = await mongoose_1.default.startSession();
        let createdBooking;
        try {
            await dbSession.withTransaction(async () => {
                const slotAvailable = await this.ensureSlotAvailable({
                    supplierId: String(bundle.supplierId),
                    bookedDate,
                    slotStart,
                    slotEnd,
                    session: dbSession,
                });
                if (!slotAvailable) {
                    throw new errorHandler_1.AppError("This slot is no longer available", 409);
                }
                createdBooking = await bundleBooking_repository_1.BundleBookingRepository.createBooking({
                    bundleId: String(bundle._id),
                    supplierId: String(bundle.supplierId),
                    customerId,
                    categoryId: String(bundle.categoryId),
                    governmentId,
                    address: address.trim(),
                    notes: notes?.trim() || null,
                    bookedDate,
                    slotStart,
                    slotEnd,
                    scheduledAt,
                    status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL,
                    paymentConfirmed: false,
                    finalPrice: bundle.price,
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const payload = await buildBundleBookingPayload(createdBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitCreatedToSupplier(payload);
        await bundleBooking_events_service_1.BundleBookingEventService.notifyCreated(payload, bundle.title);
        return {
            success: true,
            message: "Bundle booking created successfully",
            booking: payload,
        };
    }
    static async getSupplierBookings(input) {
        const bookings = await bundleBooking_repository_1.BundleBookingRepository.findSupplierBookings(input.supplierId, input.status);
        const enriched = await Promise.all(bookings.map((item) => buildBundleBookingPayload(item._id.toString())));
        return {
            success: true,
            count: enriched.filter(Boolean).length,
            bookings: enriched.filter(Boolean),
        };
    }
    static async getCustomerBookings(input) {
        const bookings = await bundleBooking_repository_1.BundleBookingRepository.findCustomerBookings(input.customerId, input.status);
        const enriched = await Promise.all(bookings.map((item) => buildBundleBookingPayload(item._id.toString())));
        return {
            success: true,
            count: enriched.filter(Boolean).length,
            bookings: enriched.filter(Boolean),
        };
    }
    static async getBookingById(input) {
        await this.getBookingForActor(input.bookingId, input.userId);
        const booking = await buildBundleBookingPayload(input.bookingId);
        if (!booking) {
            throw new errorHandler_1.AppError("Booking not found", 404);
        }
        return {
            success: true,
            booking,
        };
    }
    static async acceptBundleBooking(input) {
        const dbSession = await mongoose_1.default.startSession();
        let updatedBooking;
        try {
            await dbSession.withTransaction(async () => {
                const booking = await bundleBooking_repository_1.BundleBookingRepository.findSupplierBookingByStatus(input.bookingId, input.supplierId, bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL, dbSession);
                if (!booking) {
                    throw new errorHandler_1.AppError("Pending booking not found", 404);
                }
                const slotAvailable = await this.ensureSlotAvailable({
                    supplierId: input.supplierId,
                    bookedDate: booking.bookedDate,
                    slotStart: booking.slotStart,
                    slotEnd: booking.slotEnd,
                    excludeBookingId: String(booking._id),
                    session: dbSession,
                });
                if (!slotAvailable) {
                    throw new errorHandler_1.AppError("Booking slot is no longer available", 409);
                }
                updatedBooking = await bundleBooking_repository_1.BundleBookingRepository.updateBooking(String(booking._id), { status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.ACCEPTED }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const payload = await buildBundleBookingPayload(updatedBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitAccepted(payload);
        await bundleBooking_events_service_1.BundleBookingEventService.notifyAccepted(payload);
        return {
            success: true,
            message: "Booking accepted successfully",
            booking: payload,
        };
    }
    static async rejectBundleBooking(input) {
        const booking = await bundleBooking_repository_1.BundleBookingRepository.findSupplierBookingByStatus(input.bookingId, input.supplierId, bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL);
        if (!booking) {
            throw new errorHandler_1.AppError("Pending booking not found", 404);
        }
        const updatedBooking = await bundleBooking_repository_1.BundleBookingRepository.updateBooking(String(booking._id), {
            status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.REJECTED,
            rejectionReason: input.rejectionReason?.trim() || null,
        });
        const payload = await buildBundleBookingPayload(updatedBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitRejected(payload);
        await bundleBooking_events_service_1.BundleBookingEventService.notifyRejected(payload);
        return {
            success: true,
            message: "Booking rejected successfully",
            booking: payload,
        };
    }
    static async startBundleBooking(input) {
        const booking = await bundleBooking_repository_1.BundleBookingRepository.findSupplierBookingByStatus(input.bookingId, input.supplierId, bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.ACCEPTED);
        if (!booking) {
            throw new errorHandler_1.AppError("Accepted booking not found", 404);
        }
        const updatedBooking = await bundleBooking_repository_1.BundleBookingRepository.updateBooking(String(booking._id), { status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.IN_PROGRESS });
        const payload = await buildBundleBookingPayload(updatedBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitUpdated(payload);
        return {
            success: true,
            message: "Booking started successfully",
            booking: payload,
        };
    }
    static async markBundleBookingDone(input) {
        const booking = await bundleBooking_repository_1.BundleBookingRepository.findSupplierBookingByStatus(input.bookingId, input.supplierId, bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.IN_PROGRESS);
        if (!booking) {
            throw new errorHandler_1.AppError("In-progress booking not found", 404);
        }
        const updatedBooking = await bundleBooking_repository_1.BundleBookingRepository.updateBooking(String(booking._id), { status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.DONE });
        const payload = await buildBundleBookingPayload(updatedBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitUpdated(payload);
        await bundleBooking_events_service_1.BundleBookingEventService.notifyDone(payload);
        return {
            success: true,
            message: "Booking marked as done",
            booking: payload,
        };
    }
    static async confirmBundlePayment(input) {
        const booking = await bundleBooking_repository_1.BundleBookingRepository.findSupplierBookingByStatus(input.bookingId, input.supplierId, bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.DONE);
        if (!booking) {
            throw new errorHandler_1.AppError("Done booking not found", 404);
        }
        const updatedBooking = await bundleBooking_repository_1.BundleBookingRepository.updateBooking(String(booking._id), {
            paymentConfirmed: true,
            paymentConfirmedAt: new Date(),
            status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.COMPLETED,
        });
        const payload = await buildBundleBookingPayload(updatedBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitUpdated(payload);
        await bundleBooking_events_service_1.BundleBookingEventService.notifyCompleted(payload);
        return {
            success: true,
            message: "Payment confirmed and booking completed",
            booking: payload,
        };
    }
    static async cancelBundleBooking(input) {
        const { booking, isCustomer, isSupplier } = await this.getBookingForActor(input.bookingId, input.userId);
        if ([
            bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.COMPLETED,
            bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.CANCELLED,
            bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.REJECTED,
        ].includes(booking.status)) {
            throw new errorHandler_1.AppError("Booking cannot be cancelled now", 400);
        }
        const cancelledBy = isCustomer ? "customer" : "supplier";
        const updatedBooking = await bundleBooking_repository_1.BundleBookingRepository.updateBooking(String(booking._id), {
            status: bundleBooking_constants_1.BUNDLE_BOOKING_STATUS.CANCELLED,
            cancelledBy,
        });
        const payload = await buildBundleBookingPayload(updatedBooking._id.toString());
        bundleBooking_events_service_1.BundleBookingEventService.emitCancelled(payload);
        await bundleBooking_events_service_1.BundleBookingEventService.notifyCancelled(payload, cancelledBy);
        return {
            success: true,
            message: "Booking cancelled successfully",
            booking: payload,
        };
    }
}
exports.BundleBookingService = BundleBookingService;

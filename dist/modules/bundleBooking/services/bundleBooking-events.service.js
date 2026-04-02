"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleBookingEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
const bundleBooking_constants_1 = require("../../../shared/constants/bundleBooking.constants");
const notification_publisher_1 = require("../../notification/notification.publisher");
class BundleBookingEventService {
    static emitToCustomerAndSupplier(eventName, booking) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(booking.customerId))).emit(eventName, booking);
        io.to(socket_1.socketRooms.user(String(booking.supplierId))).emit(eventName, booking);
    }
    static emitCreatedToSupplier(booking) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(booking.supplierId))).emit(socket_1.socketEvents.CREATED, booking);
    }
    static emitAccepted(booking) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(booking.customerId))).emit(socket_1.socketEvents.ACCEPTED, booking);
        io.to(socket_1.socketRooms.user(String(booking.supplierId))).emit(socket_1.socketEvents.UPDATED, booking);
    }
    static emitRejected(booking) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(booking.customerId))).emit(socket_1.socketEvents.REJECTED, booking);
        io.to(socket_1.socketRooms.user(String(booking.supplierId))).emit(socket_1.socketEvents.UPDATED, booking);
    }
    static emitUpdated(booking) {
        this.emitToCustomerAndSupplier(socket_1.socketEvents.UPDATED, booking);
    }
    static emitCancelled(booking) {
        this.emitToCustomerAndSupplier(socket_1.socketEvents.CANCELLED, booking);
    }
    static async notifyCreated(booking, bundleTitle) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(booking.supplierId),
            type: bundleBooking_constants_1.BUNDLE_BOOKING_NOTIFICATION_TYPES.CREATED,
            title: "New Bundle Booking Request",
            message: `You received a new booking request${bundleTitle ? ` for "${bundleTitle}"` : ""}.`,
            data: {
                bookingId: String(booking._id),
                bundleId: String(booking.bundleId),
                customerId: String(booking.customerId),
            },
        });
    }
    static async notifyAccepted(booking) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(booking.customerId),
            type: bundleBooking_constants_1.BUNDLE_BOOKING_NOTIFICATION_TYPES.ACCEPTED,
            title: "Booking Accepted",
            message: "Your bundle booking has been accepted by the supplier.",
            data: {
                bookingId: String(booking._id),
                bundleId: String(booking.bundleId),
            },
        });
    }
    static async notifyRejected(booking) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(booking.customerId),
            type: bundleBooking_constants_1.BUNDLE_BOOKING_NOTIFICATION_TYPES.REJECTED,
            title: "Booking Rejected",
            message: "Your bundle booking was rejected by the supplier.",
            data: {
                bookingId: String(booking._id),
                bundleId: String(booking.bundleId),
                rejectionReason: booking.rejectionReason || null,
            },
        });
    }
    static async notifyDone(booking) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(booking.customerId),
            type: bundleBooking_constants_1.BUNDLE_BOOKING_NOTIFICATION_TYPES.DONE,
            title: "Service Finished",
            message: "The supplier marked your service as done.",
            data: {
                bookingId: String(booking._id),
            },
        });
    }
    static async notifyCompleted(booking) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(booking.customerId),
            type: bundleBooking_constants_1.BUNDLE_BOOKING_NOTIFICATION_TYPES.COMPLETED,
            title: "Booking Completed",
            message: "Your bundle booking has been completed successfully.",
            data: {
                bookingId: String(booking._id),
            },
        });
    }
    static async notifyCancelled(booking, cancelledBy) {
        await (0, notification_publisher_1.publishNotification)({
            userId: cancelledBy === "customer"
                ? String(booking.supplierId)
                : String(booking.customerId),
            type: bundleBooking_constants_1.BUNDLE_BOOKING_NOTIFICATION_TYPES.CANCELLED,
            title: "Booking Cancelled",
            message: cancelledBy === "customer"
                ? "The customer cancelled the booking."
                : "The supplier cancelled the booking.",
            data: {
                bookingId: String(booking._id),
                cancelledBy,
            },
        });
    }
}
exports.BundleBookingEventService = BundleBookingEventService;

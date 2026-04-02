"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
const session_constants_1 = require("../../../shared/constants/session.constants");
const notification_publisher_1 = require("../../notification/notification.publisher");
class SessionEventService {
    static emitSessionToParticipants(eventName, session, extra = {}) {
        const io = (0, socket_1.getIO)();
        const payload = {
            sessionId: session._id.toString(),
            session,
            ...extra,
        };
        io.to(socket_1.socketRooms.chat(session._id.toString())).emit(eventName, payload);
        io.to(socket_1.socketRooms.user(session.customerId.toString())).emit(eventName, payload);
        io.to(socket_1.socketRooms.user(session.supplierId.toString())).emit(eventName, payload);
    }
    static async notifySessionCreated(session) {
        await Promise.all([
            (0, notification_publisher_1.publishNotification)({
                userId: session.customerId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
                title: "New Job Started",
                message: `A new job has started for order #${session.orderId}.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                    offerId: session.offerId.toString(),
                    supplierId: session.supplierId.toString(),
                },
            }),
            (0, notification_publisher_1.publishNotification)({
                userId: session.supplierId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
                title: "New Job Assigned",
                message: `You have been assigned a job for order #${session.orderId}.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                    offerId: session.offerId.toString(),
                    customerId: session.customerId.toString(),
                },
            }),
        ]);
    }
    static async notifySessionStatusUpdated(session, status) {
        await (0, notification_publisher_1.publishNotification)({
            userId: session.customerId.toString(),
            type: session_constants_1.SESSION_NOTIFICATION_TYPES.SUPPLIER_STATUS_UPDATE,
            title: "Supplier Status Update",
            message: `Your supplier updated the session to "${status}" for order #${session.orderId}.`,
            data: {
                sessionId: session._id.toString(),
                orderId: session.orderId.toString(),
                supplierId: session.supplierId.toString(),
                status,
            },
        });
    }
    static async notifySessionCancelled(session, cancelledBy) {
        await Promise.all([
            (0, notification_publisher_1.publishNotification)({
                userId: session.customerId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_CANCELLED,
                title: "Session Cancelled",
                message: cancelledBy === "customer"
                    ? `You cancelled the job for order #${session.orderId}.`
                    : `The supplier cancelled the job for order #${session.orderId}. Your order is available again.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                    cancelledBy,
                },
            }),
            (0, notification_publisher_1.publishNotification)({
                userId: session.supplierId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_CANCELLED,
                title: "Session Cancelled",
                message: cancelledBy === "customer"
                    ? `The customer cancelled the job for order #${session.orderId}.`
                    : `You cancelled the job for order #${session.orderId}.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                    cancelledBy,
                },
            }),
        ]);
    }
    static async notifySessionCompleted(session) {
        await Promise.all([
            (0, notification_publisher_1.publishNotification)({
                userId: session.customerId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_COMPLETED,
                title: "Job Completed",
                message: `Your job for order #${session.orderId} has been completed.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                },
            }),
            (0, notification_publisher_1.publishNotification)({
                userId: session.supplierId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_COMPLETED,
                title: "Job Completed",
                message: `You completed the job for order #${session.orderId}.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                },
            }),
        ]);
    }
    static async notifyPaymentConfirmed(session) {
        await Promise.all([
            (0, notification_publisher_1.publishNotification)({
                userId: session.customerId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_PAYMENT_CONFIRMED,
                title: "Payment Confirmed",
                message: `Payment was confirmed for order #${session.orderId}.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                },
            }),
            (0, notification_publisher_1.publishNotification)({
                userId: session.supplierId.toString(),
                type: session_constants_1.SESSION_NOTIFICATION_TYPES.SESSION_PAYMENT_CONFIRMED,
                title: "Payment Confirmed",
                message: `Payment was confirmed for order #${session.orderId}.`,
                data: {
                    sessionId: session._id.toString(),
                    orderId: session.orderId.toString(),
                },
            }),
        ]);
    }
}
exports.SessionEventService = SessionEventService;

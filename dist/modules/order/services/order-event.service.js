"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
const notification_publisher_1 = require("../../notification/notification.publisher");
const buildSupplierOrderPayload_1 = require("../../../shared/utils/buildSupplierOrderPayload");
class OrderEventService {
    static buildEnvelope(input) {
        return {
            type: input.type,
            orderId: input.orderId,
            order: input.order ?? null,
            meta: {
                actorId: input.actorId || null,
                actorRole: input.actorRole || null,
                reason: input.reason || null,
                changedAt: new Date().toISOString(),
            },
        };
    }
    static async emitOrderCreated(orderId, categoryId, governmentId) {
        const order = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(orderId);
        if (!order) {
            throw new Error("Failed to build order payload");
        }
        const payload = this.buildEnvelope({
            type: "order.created",
            orderId,
            order,
        });
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_NEW, payload);
        return order;
    }
    static async emitOrderUpdated(orderId, categoryId, governmentId) {
        const order = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(orderId);
        if (!order) {
            throw new Error("Failed to build order payload");
        }
        const payload = this.buildEnvelope({
            type: "order.updated",
            orderId,
            order,
        });
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_UPDATED, payload);
        return order;
    }
    static async emitOrderCancelled(orderId, categoryId, governmentId, meta) {
        const payload = this.buildEnvelope({
            type: "order.cancelled",
            orderId,
            actorId: meta?.actorId,
            actorRole: meta?.actorRole,
            reason: meta?.reason,
        });
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_CANCELLED, payload);
    }
    static async emitOrderAvailableAgain(orderId, categoryId, governmentId, reason) {
        const order = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(orderId);
        if (!order)
            return null;
        const payload = this.buildEnvelope({
            type: "order.available_again",
            orderId,
            order,
            reason: reason || null,
        });
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_AVAILABLE_AGAIN, payload);
        return order;
    }
    static async notifySuppliersOrderCancelled(pendingOffers, orderId, reason = "order_cancelled_by_customer") {
        const io = (0, socket_1.getIO)();
        for (const offer of pendingOffers) {
            io.to(socket_1.socketRooms.user(offer.supplierId.toString())).emit(socket_1.socketEvents.OFFER_REJECTED, {
                type: "offer.rejected",
                offerId: offer._id.toString(),
                orderId,
                meta: {
                    reason,
                    changedAt: new Date().toISOString(),
                },
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: offer.supplierId.toString(),
                type: "OFFER_REJECTED",
                title: "Offer Rejected",
                message: `Your offer for order #${orderId} was rejected because the order was cancelled.`,
                data: {
                    offerId: offer._id.toString(),
                    orderId,
                    reason,
                },
            });
        }
    }
}
exports.OrderEventService = OrderEventService;

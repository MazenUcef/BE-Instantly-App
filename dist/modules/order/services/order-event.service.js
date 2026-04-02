"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
const notification_publisher_1 = require("../../notification/notification.publisher");
const buildSupplierOrderPayload_1 = require("../../../shared/utils/buildSupplierOrderPayload");
class OrderEventService {
    static async emitOrderCreated(orderId, categoryId, governmentId) {
        const payload = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(orderId);
        if (!payload) {
            throw new Error("Failed to build order payload");
        }
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_NEW, payload);
        return payload;
    }
    static async emitOrderUpdated(orderId, categoryId, governmentId) {
        const payload = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(orderId);
        if (!payload) {
            throw new Error("Failed to build order payload");
        }
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_UPDATED, payload);
        return payload;
    }
    static async emitOrderDeleted(orderId, categoryId, governmentId) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_DELETED, { orderId });
    }
    static async notifySuppliersOrderDeleted(pendingOffers, orderId) {
        const io = (0, socket_1.getIO)();
        for (const offer of pendingOffers) {
            io.to(socket_1.socketRooms.user(offer.supplierId.toString())).emit(socket_1.socketEvents.OFFER_REJECTED, {
                offerId: offer._id.toString(),
                orderId,
                reason: "order_deleted_by_customer",
                timestamp: new Date(),
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: offer.supplierId.toString(),
                type: "OFFER_REJECTED",
                title: "Offer Rejected",
                message: `Your offer for order #${orderId} was rejected because the customer deleted the order.`,
                data: {
                    offerId: offer._id.toString(),
                    orderId,
                },
            });
        }
    }
}
exports.OrderEventService = OrderEventService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfferEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
const notification_publisher_1 = require("../../notification/notification.publisher");
const buildSupplierOrderPayload_1 = require("../../../shared/utils/buildSupplierOrderPayload");
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const Order_model_1 = __importDefault(require("../../order/models/Order.model"));
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const offer_repository_1 = require("../repository/offer.repository");
class OfferEventService {
    static async buildOfferPayload(offer) {
        const supplier = await User_model_1.default.findById(offer.supplierId).select("-password -refreshToken -biometrics");
        return {
            ...offer.toObject(),
            supplier: supplier || null,
        };
    }
    static async emitOfferCreatedToCustomer(input) {
        const io = (0, socket_1.getIO)();
        const payload = await this.buildOfferPayload(input.offer);
        io.to(socket_1.socketRooms.user(input.customerId)).emit(socket_1.socketEvents.OFFER_NEW, payload);
        return payload;
    }
    static async emitOfferUpdatedToCustomer(input) {
        const io = (0, socket_1.getIO)();
        const payload = await this.buildOfferPayload(input.offer);
        io.to(socket_1.socketRooms.user(input.customerId)).emit(socket_1.socketEvents.OFFER_UPDATED, payload);
        return payload;
    }
    static async emitSupplierPendingCountUpdate(supplierId) {
        const io = (0, socket_1.getIO)();
        const pendingOffersCount = await offer_repository_1.OfferRepository.countPendingOffersBySupplier(supplierId);
        io.to(socket_1.socketRooms.user(supplierId)).emit(socket_1.socketEvents.SUPPLIER_PENDING_COUNT_UPDATE, {
            pendingOffersCount,
            timestamp: new Date(),
        });
        return pendingOffersCount;
    }
    static async emitSupplierPendingOffersList(supplierId) {
        const io = (0, socket_1.getIO)();
        const offers = await offer_repository_1.OfferRepository.findPendingOffersBySupplier(supplierId);
        const enriched = await Promise.all(offers.map(async (offer) => {
            const order = await Order_model_1.default.findById(offer.orderId).lean();
            return {
                ...offer.toObject(),
                order: order || null,
            };
        }));
        io.to(socket_1.socketRooms.user(supplierId)).emit(socket_1.socketEvents.SUPPLIER_PENDING_OFFERS_LIST, {
            offers: enriched,
            timestamp: new Date(),
        });
        return enriched;
    }
    static async notifyCustomerNewOffer(input) {
        await (0, notification_publisher_1.publishNotification)({
            userId: input.customerId,
            type: offer_constants_1.OFFER_NOTIFICATION_TYPES.NEW_OFFER,
            title: "New Offer Received",
            message: `You have received a new offer for your order #${input.orderId}.`,
            data: {
                offerId: input.offerId,
                orderId: input.orderId,
                supplierId: input.supplierId,
                amount: input.amount,
                timeRange: input.timeRange ?? null,
                timeToStart: input.timeToStart ?? null,
            },
        });
    }
    static async notifySupplierOfferAccepted(input) {
        await (0, notification_publisher_1.publishNotification)({
            userId: input.supplierId,
            type: offer_constants_1.OFFER_NOTIFICATION_TYPES.OFFER_ACCEPTED,
            title: "Offer Accepted",
            message: `Your offer for order #${input.orderId} has been accepted.`,
            data: {
                offerId: input.offerId,
                orderId: input.orderId,
                sessionId: input.sessionId || null,
                withdrawnOffersCount: input.withdrawnOrderIds.length,
                withdrawnOrderIds: input.withdrawnOrderIds,
            },
        });
    }
    static async notifySupplierOfferRejected(input) {
        await (0, notification_publisher_1.publishNotification)({
            userId: input.supplierId,
            type: offer_constants_1.OFFER_NOTIFICATION_TYPES.OFFER_REJECTED,
            title: "Offer Rejected",
            message: `Your offer for order #${input.orderId} has been rejected.`,
            data: {
                offerId: input.offerId,
                orderId: input.orderId,
            },
        });
    }
    static async emitOrderAvailableAgain(orderId) {
        const payload = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(orderId);
        if (!payload)
            return;
        const categoryId = payload.category?._id?.toString?.();
        const governmentId = payload.government?._id?.toString?.();
        if (!categoryId || !governmentId)
            return;
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.supplierOrders(categoryId, governmentId)).emit(socket_1.socketEvents.ORDER_AVAILABLE_AGAIN, {
            orderId,
            order: payload,
            timestamp: new Date(),
        });
    }
}
exports.OfferEventService = OfferEventService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfferService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const Order_model_1 = __importDefault(require("../../order/models/Order.model"));
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const offer_event_service_1 = require("./offer-event.service");
const order_constants_1 = require("../../../shared/constants/order.constants");
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const socket_1 = require("../../../shared/config/socket");
const buildSupplierOrderPayload_1 = require("../../../shared/utils/buildSupplierOrderPayload");
const offer_repository_1 = require("../repository/offer.repository");
const order_repository_1 = require("../../order/repositories/order.repository");
const order_event_service_1 = require("../../order/services/order-event.service");
const session_repository_1 = require("../../session/repositories/session.repository");
const session_event_service_1 = require("../../session/services/session-event.service");
const session_constants_1 = require("../../../shared/constants/session.constants");
class OfferService {
    static async ensureSupplierCanCreateOffer(supplierId, dbSession) {
        const [reviewRequiredOrder, activeAcceptedOffer] = await Promise.all([
            Order_model_1.default.findOne({
                supplierId,
                status: order_constants_1.ORDER_STATUS.COMPLETED,
                supplierReviewed: false,
            })
                .sort({ updatedAt: -1 })
                .session(dbSession || null),
            offer_repository_1.OfferRepository.findAcceptedOfferBySupplier(supplierId, dbSession),
        ]);
        if (reviewRequiredOrder) {
            const session = await session_model_1.default
                .findOne({
                orderId: reviewRequiredOrder._id,
            })
                .session(dbSession || null);
            let customer = null;
            if (session?.customerId) {
                customer = await User_model_1.default.findById(session.customerId).select("-password -refreshToken -biometrics");
            }
            const error = new errorHandler_1.AppError("You must review your last completed job before creating a new offer.", 403);
            error.reviewRequired = true;
            error.order = {
                ...reviewRequiredOrder.toObject(),
                customer,
            };
            throw error;
        }
        if (activeAcceptedOffer) {
            throw new errorHandler_1.AppError("You already have an active job. Cannot create new offers.", 400);
        }
    }
    static async validateOrderForOfferCreation(orderId) {
        const order = await Order_model_1.default.findById(orderId);
        if (!order) {
            throw new errorHandler_1.AppError("Order not found", 404);
        }
        if (order.status !== order_constants_1.ORDER_STATUS.PENDING) {
            throw new errorHandler_1.AppError("Only pending orders can receive offers", 400);
        }
        return order;
    }
    static async createOffer(input) {
        const { supplierId, orderId, amount, timeRange, timeToStart } = input;
        if (!amount || amount <= 0) {
            throw new errorHandler_1.AppError("Offer amount must be greater than 0", 400);
        }
        const dbSession = await mongoose_1.default.startSession();
        let order;
        let offer;
        let created = false;
        try {
            await dbSession.withTransaction(async () => {
                await this.ensureSupplierCanCreateOffer(supplierId, dbSession);
                order = await Order_model_1.default.findById(orderId).session(dbSession || null);
                if (!order) {
                    throw new errorHandler_1.AppError("Order not found", 404);
                }
                if (order.status !== order_constants_1.ORDER_STATUS.PENDING) {
                    throw new errorHandler_1.AppError("Cannot create offer for this order now", 400);
                }
                if (order.customerId.toString() === supplierId) {
                    throw new errorHandler_1.AppError("You cannot create an offer on your own order", 400);
                }
                const existingOffer = await offer_repository_1.OfferRepository.findPendingOfferBySupplierAndOrder(supplierId, orderId, dbSession);
                if (existingOffer) {
                    offer = await offer_repository_1.OfferRepository.updatePendingOffer(existingOffer._id, {
                        amount,
                        timeRange,
                        timeToStart,
                        expiresAt: null,
                    }, dbSession);
                    created = false;
                }
                else {
                    offer = await offer_repository_1.OfferRepository.createOffer({
                        orderId,
                        supplierId,
                        amount,
                        timeRange,
                        timeToStart,
                        expiresAt: null,
                        status: offer_constants_1.OFFER_STATUS.PENDING,
                    }, dbSession);
                    created = true;
                }
            });
        }
        catch (error) {
            if (error?.code === 11000) {
                throw new errorHandler_1.AppError("A pending offer for this order already exists for this supplier.", 409);
            }
            throw error;
        }
        finally {
            await dbSession.endSession();
        }
        const payload = created
            ? await offer_event_service_1.OfferEventService.emitOfferCreatedToCustomer({
                customerId: order.customerId.toString(),
                offer,
            })
            : await offer_event_service_1.OfferEventService.emitOfferUpdatedToCustomer({
                customerId: order.customerId.toString(),
                offer,
            });
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(supplierId)).emit(created
            ? socket_1.socketEvents.SUPPLIER_OFFER_CREATED
            : socket_1.socketEvents.SUPPLIER_OFFER_UPDATED, {
            offer: payload,
            timestamp: new Date(),
        });
        await Promise.all([
            offer_event_service_1.OfferEventService.emitSupplierPendingCountUpdate(supplierId),
            offer_event_service_1.OfferEventService.emitSupplierPendingOffersList(supplierId),
            offer_event_service_1.OfferEventService.notifyCustomerNewOffer({
                customerId: order.customerId.toString(),
                orderId: order._id.toString(),
                offerId: offer._id.toString(),
                supplierId,
                amount,
                timeRange,
                timeToStart,
            }),
        ]);
        return {
            success: true,
            created,
            message: created
                ? "Offer created successfully"
                : "Offer updated successfully",
            offer: payload,
        };
    }
    static async acceptOffer(input) {
        const { offerId, customerId } = input;
        const dbSession = await mongoose_1.default.startSession();
        let offer;
        let order;
        let sessionDoc;
        let supplierOtherPendingOffers = [];
        let rejectedOrderOffers = [];
        try {
            await dbSession.withTransaction(async () => {
                const existingOffer = await offer_repository_1.OfferRepository.findById(offerId, dbSession);
                if (!existingOffer) {
                    throw new errorHandler_1.AppError("Offer not found", 404);
                }
                if (existingOffer.status !== offer_constants_1.OFFER_STATUS.PENDING) {
                    throw new errorHandler_1.AppError("Offer not found or already processed", 409);
                }
                order = await Order_model_1.default.findById(existingOffer.orderId).session(dbSession || null);
                if (!order) {
                    throw new errorHandler_1.AppError("Associated order not found", 404);
                }
                if (order.customerId.toString() !== customerId) {
                    throw new errorHandler_1.AppError("Not allowed", 403);
                }
                if (order.status !== order_constants_1.ORDER_STATUS.PENDING) {
                    throw new errorHandler_1.AppError("Order is not available for offer acceptance", 409);
                }
                offer = await offer_repository_1.OfferRepository.acceptPendingOffer(offerId, dbSession);
                if (!offer) {
                    throw new errorHandler_1.AppError("Offer not found or already processed", 409);
                }
                supplierOtherPendingOffers =
                    await offer_repository_1.OfferRepository.findSupplierOtherPendingOffers(offer.supplierId, offer._id, dbSession);
                rejectedOrderOffers = await offer_repository_1.OfferRepository.findPendingOffersByOrder(order._id, dbSession);
                await offer_repository_1.OfferRepository.rejectOtherPendingOffersForSupplier(offer.supplierId, offer._id, dbSession);
                await offer_repository_1.OfferRepository.rejectOtherOffersForOrder(order._id, offer._id, dbSession);
                const updatedOrder = await order_repository_1.OrderRepository.markInProgress(order._id, offer.supplierId, offer.amount, dbSession);
                if (!updatedOrder) {
                    throw new errorHandler_1.AppError("Order state changed concurrently", 409);
                }
                sessionDoc = await session_repository_1.SessionRepository.createSession({
                    orderId: order._id,
                    offerId: offer._id,
                    customerId: order.customerId,
                    supplierId: offer.supplierId,
                    status: session_constants_1.SESSION_STATUS.STARTED,
                    startedAt: new Date(),
                }, dbSession);
            });
        }
        catch (error) {
            if (error?.code === 11000) {
                throw new errorHandler_1.AppError("This offer or supplier active job state changed. Please refresh and try again.", 409);
            }
            throw error;
        }
        finally {
            await dbSession.endSession();
        }
        const io = (0, socket_1.getIO)();
        const orderPayload = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(order._id.toString());
        const sessionPayload = sessionDoc
            ? {
                _id: sessionDoc._id.toString(),
                orderId: sessionDoc.orderId.toString(),
                offerId: sessionDoc.offerId.toString(),
                customerId: sessionDoc.customerId.toString(),
                supplierId: sessionDoc.supplierId.toString(),
                status: sessionDoc.status,
            }
            : null;
        io.to(socket_1.socketRooms.user(offer.supplierId.toString())).emit(socket_1.socketEvents.OFFER_ACCEPTED, {
            offerId: offer._id.toString(),
            orderId: offer.orderId.toString(),
            supplierId: offer.supplierId.toString(),
            sessionId: sessionDoc?._id?.toString() || null,
            order: orderPayload,
            session: sessionPayload,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(order.customerId.toString())).emit(socket_1.socketEvents.OFFER_ACCEPTED, {
            offerId: offer._id.toString(),
            orderId: offer.orderId.toString(),
            supplierId: offer.supplierId.toString(),
            sessionId: sessionDoc?._id?.toString() || null,
            order: orderPayload,
            session: sessionPayload,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(order.customerId.toString())).emit(socket_1.socketEvents.SESSION_CREATED, {
            session: sessionPayload,
            order: orderPayload,
            offer: {
                _id: offer._id.toString(),
                orderId: offer.orderId.toString(),
                supplierId: offer.supplierId.toString(),
                amount: offer.amount,
                status: offer.status,
            },
            meta: {
                trigger: "offer_accepted",
                timestamp: new Date(),
            },
        });
        io.to(socket_1.socketRooms.user(offer.supplierId.toString())).emit(socket_1.socketEvents.SESSION_CREATED, {
            session: sessionPayload,
            order: orderPayload,
            offer: {
                _id: offer._id.toString(),
                orderId: offer.orderId.toString(),
                supplierId: offer.supplierId.toString(),
                amount: offer.amount,
                status: offer.status,
            },
            meta: {
                trigger: "offer_accepted",
                timestamp: new Date(),
            },
        });
        for (const pendingOffer of supplierOtherPendingOffers) {
            const pendingOrder = await Order_model_1.default.findById(pendingOffer.orderId);
            if (!pendingOrder)
                continue;
            io.to(socket_1.socketRooms.user(pendingOrder.customerId.toString())).emit(socket_1.socketEvents.OFFER_DELETED, {
                offerId: pendingOffer._id.toString(),
                orderId: pendingOffer.orderId.toString(),
                supplierId: offer.supplierId.toString(),
                message: "Supplier withdrew their offer as they accepted another job",
                acceptedOrderId: order._id.toString(),
                timestamp: new Date(),
            });
        }
        await Promise.all([
            offer_event_service_1.OfferEventService.emitSupplierPendingCountUpdate(offer.supplierId.toString()),
            offer_event_service_1.OfferEventService.emitSupplierPendingOffersList(offer.supplierId.toString()),
            offer_event_service_1.OfferEventService.notifySupplierOfferAccepted({
                supplierId: offer.supplierId.toString(),
                orderId: order._id.toString(),
                offerId: offer._id.toString(),
                sessionId: sessionDoc?._id?.toString() || null,
                withdrawnOrderIds: supplierOtherPendingOffers.map((o) => o.orderId.toString()),
            }),
        ]);
        return {
            success: true,
            message: "Offer accepted successfully",
            offer: {
                _id: offer._id.toString(),
                orderId: offer.orderId.toString(),
                supplierId: offer.supplierId.toString(),
                amount: offer.amount,
                status: offer.status,
            },
            session: sessionPayload,
            order: orderPayload,
            withdrawnOffers: {
                count: supplierOtherPendingOffers.length,
                orders: supplierOtherPendingOffers.map((o) => o.orderId.toString()),
            },
        };
    }
    static async rejectOffer(input) {
        const { offerId, customerId } = input;
        const offer = await offer_repository_1.OfferRepository.findById(offerId);
        if (!offer) {
            throw new errorHandler_1.AppError("Offer not found", 404);
        }
        const order = await Order_model_1.default.findById(offer.orderId);
        if (!order) {
            throw new errorHandler_1.AppError("Associated order not found", 404);
        }
        if (order.customerId.toString() !== customerId) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        if (order.status !== order_constants_1.ORDER_STATUS.PENDING) {
            throw new errorHandler_1.AppError("Cannot reject offer for this order now", 400);
        }
        const rejectedOffer = await offer_repository_1.OfferRepository.rejectPendingOffer(offerId);
        if (!rejectedOffer) {
            throw new errorHandler_1.AppError("Offer not found or already processed", 409);
        }
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(rejectedOffer.supplierId.toString())).emit(socket_1.socketEvents.OFFER_REJECTED, {
            offerId: rejectedOffer._id.toString(),
            orderId: rejectedOffer.orderId.toString(),
            reason: "customer_rejected",
            timestamp: new Date(),
        });
        await Promise.all([
            offer_event_service_1.OfferEventService.emitSupplierPendingCountUpdate(rejectedOffer.supplierId.toString()),
            offer_event_service_1.OfferEventService.emitSupplierPendingOffersList(rejectedOffer.supplierId.toString()),
            offer_event_service_1.OfferEventService.emitOrderAvailableAgain(rejectedOffer.orderId.toString()),
            offer_event_service_1.OfferEventService.notifySupplierOfferRejected({
                supplierId: rejectedOffer.supplierId.toString(),
                offerId: rejectedOffer._id.toString(),
                orderId: rejectedOffer.orderId.toString(),
            }),
        ]);
        return {
            success: true,
            message: "Offer rejected successfully",
            offer: rejectedOffer,
        };
    }
    static async deleteOffer(input) {
        const { offerId, supplierId } = input;
        const dbSession = await mongoose_1.default.startSession();
        let deletedOffer = null;
        let relatedOrder = null;
        let relatedSession = null;
        let flowType = null;
        try {
            await dbSession.withTransaction(async () => {
                const existingOffer = await offer_repository_1.OfferRepository.findById(offerId, dbSession);
                if (!existingOffer) {
                    throw new errorHandler_1.AppError("Offer not found", 404);
                }
                if (existingOffer.supplierId.toString() !== supplierId) {
                    throw new errorHandler_1.AppError("Not allowed", 403);
                }
                if (![offer_constants_1.OFFER_STATUS.PENDING, offer_constants_1.OFFER_STATUS.ACCEPTED].includes(existingOffer.status)) {
                    throw new errorHandler_1.AppError("Only pending or accepted offers can be withdrawn by supplier", 400);
                }
                relatedOrder = await Order_model_1.default.findById(existingOffer.orderId).session(dbSession || null);
                if (!relatedOrder) {
                    throw new errorHandler_1.AppError("Associated order not found", 404);
                }
                if (existingOffer.status === offer_constants_1.OFFER_STATUS.PENDING) {
                    deletedOffer = await offer_repository_1.OfferRepository.withdrawPendingOfferBySupplier(offerId, supplierId, dbSession);
                    if (!deletedOffer) {
                        throw new errorHandler_1.AppError("Offer not found, not owned by supplier, or cannot be withdrawn", 404);
                    }
                    flowType = "pending_withdraw";
                    return;
                }
                // accepted offer flow
                const activeRelatedSession = await session_model_1.default
                    .findOne({
                    offerId: existingOffer._id,
                    status: {
                        $nin: [session_constants_1.SESSION_STATUS.COMPLETED, session_constants_1.SESSION_STATUS.CANCELLED],
                    },
                })
                    .session(dbSession || null);
                if (activeRelatedSession) {
                    const cancelled = await session_repository_1.SessionRepository.markCancelled(activeRelatedSession._id, activeRelatedSession.status, session_constants_1.SESSION_CANCELLED_BY.SUPPLIER, "supplier_deleted_accepted_offer", dbSession);
                    // Capture the updated session for post-transaction socket emissions
                    relatedSession = cancelled || activeRelatedSession;
                    relatedSession.status = session_constants_1.SESSION_STATUS.CANCELLED;
                    relatedSession.cancelledBy = session_constants_1.SESSION_CANCELLED_BY.SUPPLIER;
                    relatedSession.cancellationReason = "supplier_deleted_accepted_offer";
                }
                deletedOffer = await offer_repository_1.OfferRepository.withdrawAcceptedOfferBySupplier(offerId, supplierId, dbSession);
                if (!deletedOffer) {
                    throw new errorHandler_1.AppError("Accepted offer could not be withdrawn", 409);
                }
                const resetOrder = await order_repository_1.OrderRepository.resetToPending(relatedOrder._id, dbSession);
                if (!resetOrder) {
                    throw new errorHandler_1.AppError("Order state changed concurrently", 409);
                }
                flowType = "accepted_cancel";
            });
        }
        catch (error) {
            if (error?.code === 11000) {
                throw new errorHandler_1.AppError("State changed while withdrawing the offer. Please refresh and try again.", 409);
            }
            throw error;
        }
        finally {
            await dbSession.endSession();
        }
        const io = (0, socket_1.getIO)();
        if (flowType === "pending_withdraw") {
            io.to(socket_1.socketRooms.user(relatedOrder.customerId.toString())).emit(socket_1.socketEvents.OFFER_DELETED, {
                offerId: deletedOffer._id.toString(),
                orderId: deletedOffer.orderId.toString(),
                supplierId,
                message: "A supplier has withdrawn their offer",
                timestamp: new Date(),
            });
            io.to(socket_1.socketRooms.user(supplierId)).emit(socket_1.socketEvents.SUPPLIER_OFFER_WITHDRAWN, {
                offerId: deletedOffer._id.toString(),
                orderId: deletedOffer.orderId.toString(),
                reason: "user_deleted",
                timestamp: new Date(),
            });
            await Promise.all([
                offer_event_service_1.OfferEventService.emitSupplierPendingCountUpdate(supplierId),
                offer_event_service_1.OfferEventService.emitSupplierPendingOffersList(supplierId),
            ]);
            return {
                success: true,
                message: "Offer withdrawn successfully",
                data: {
                    offerId: deletedOffer._id.toString(),
                    orderId: deletedOffer.orderId.toString(),
                },
            };
        }
        if (relatedSession) {
            session_event_service_1.SessionEventService.emitSessionCancelled(relatedSession, {
                actorRole: session_constants_1.SESSION_CANCELLED_BY.SUPPLIER,
                actorId: supplierId,
                reason: "supplier_deleted_accepted_offer",
            });
        }
        io.to(socket_1.socketRooms.user(relatedOrder.customerId.toString())).emit(socket_1.socketEvents.OFFER_DELETED, {
            offerId: deletedOffer._id.toString(),
            orderId: deletedOffer.orderId.toString(),
            supplierId,
            message: "The supplier cancelled the accepted offer",
            reason: "supplier_deleted_accepted_offer",
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(supplierId)).emit(socket_1.socketEvents.SUPPLIER_OFFER_WITHDRAWN, {
            offerId: deletedOffer._id.toString(),
            orderId: deletedOffer.orderId.toString(),
            reason: "supplier_deleted_accepted_offer",
            timestamp: new Date(),
        });
        await Promise.all([
            order_event_service_1.OrderEventService.emitOrderAvailableAgain(relatedOrder._id.toString(), relatedOrder.categoryId.toString(), relatedOrder.governmentId.toString(), "supplier_deleted_accepted_offer"),
            offer_event_service_1.OfferEventService.emitSupplierPendingCountUpdate(supplierId),
            offer_event_service_1.OfferEventService.emitSupplierPendingOffersList(supplierId),
        ]);
        return {
            success: true,
            message: "Accepted offer withdrawn, session cancelled, and order returned to pending",
            data: {
                offerId: deletedOffer._id.toString(),
                orderId: deletedOffer.orderId.toString(),
                sessionId: relatedSession?._id?.toString() || null,
                orderStatus: order_constants_1.ORDER_STATUS.PENDING,
                sessionStatus: session_constants_1.SESSION_STATUS.CANCELLED,
            },
        };
    }
    static async getOffersByOrder(input) {
        const { orderId, userId, role } = input;
        const order = await Order_model_1.default.findById(orderId);
        if (!order) {
            throw new errorHandler_1.AppError("Order not found", 404);
        }
        if (role === "customer" && order.customerId.toString() !== userId) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        const offers = await offer_repository_1.OfferRepository.findOrderOffers(orderId);
        const enrichedOffers = await Promise.all(offers.map(async (offer) => {
            const supplier = await User_model_1.default.findById(offer.supplierId).select("-password -refreshToken -biometrics");
            return {
                ...offer.toObject(),
                supplier: supplier || null,
            };
        }));
        return {
            success: true,
            data: enrichedOffers,
        };
    }
    static async acceptOrderDirect(input) {
        const { orderId, supplierId } = input;
        const dbSession = await mongoose_1.default.startSession();
        let order;
        let offer;
        let sessionDoc;
        let supplierPendingOffers = [];
        try {
            await dbSession.withTransaction(async () => {
                await this.ensureSupplierCanCreateOffer(supplierId, dbSession);
                order = await Order_model_1.default.findById(orderId).session(dbSession || null);
                if (!order) {
                    throw new errorHandler_1.AppError("Order not found", 404);
                }
                if (order.status !== order_constants_1.ORDER_STATUS.PENDING) {
                    throw new errorHandler_1.AppError("Order already taken or not available", 409);
                }
                if (order.customerId.toString() === supplierId) {
                    throw new errorHandler_1.AppError("You cannot accept your own order", 400);
                }
                supplierPendingOffers =
                    await offer_repository_1.OfferRepository.findPendingOffersBySupplier(supplierId, dbSession);
                offer = await offer_repository_1.OfferRepository.createOffer({
                    orderId,
                    supplierId,
                    amount: order.requestedPrice,
                    status: offer_constants_1.OFFER_STATUS.ACCEPTED,
                }, dbSession);
                await offer_repository_1.OfferRepository.rejectOtherPendingOffersForSupplier(supplierId, offer._id, dbSession);
                await offer_repository_1.OfferRepository.rejectOtherOffersForOrder(orderId, offer._id, dbSession);
                const updatedOrder = await order_repository_1.OrderRepository.markInProgress(order._id, supplierId, order.requestedPrice, dbSession);
                if (!updatedOrder) {
                    throw new errorHandler_1.AppError("Order state changed concurrently", 409);
                }
                sessionDoc = await session_repository_1.SessionRepository.createSession({
                    orderId: order._id,
                    offerId: offer._id,
                    customerId: order.customerId,
                    supplierId,
                    status: session_constants_1.SESSION_STATUS.STARTED,
                    startedAt: new Date(),
                }, dbSession);
            });
        }
        catch (error) {
            if (error?.code === 11000) {
                throw new errorHandler_1.AppError("Order or supplier active job state changed. Please refresh and try again.", 409);
            }
            throw error;
        }
        finally {
            await dbSession.endSession();
        }
        const io = (0, socket_1.getIO)();
        const orderPayload = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(order._id.toString());
        const sessionPayload = {
            _id: sessionDoc._id.toString(),
            orderId: sessionDoc.orderId.toString(),
            offerId: sessionDoc.offerId.toString(),
            customerId: sessionDoc.customerId.toString(),
            supplierId: sessionDoc.supplierId.toString(),
            status: sessionDoc.status,
        };
        io.to(socket_1.socketRooms.user(order.customerId.toString())).emit(socket_1.socketEvents.ORDER_ACCEPTED_DIRECT, {
            orderId: order._id.toString(),
            supplierId: supplierId.toString(),
            offerId: offer._id.toString(),
            sessionId: sessionDoc._id.toString(),
            order: orderPayload,
            session: sessionPayload,
            withdrawnOffersCount: supplierPendingOffers.length,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(supplierId.toString())).emit(socket_1.socketEvents.ORDER_ACCEPTED_DIRECT, {
            orderId: order._id.toString(),
            supplierId: supplierId.toString(),
            offerId: offer._id.toString(),
            sessionId: sessionDoc._id.toString(),
            order: orderPayload,
            session: sessionPayload,
            withdrawnOffersCount: supplierPendingOffers.length,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(order.customerId.toString())).emit(socket_1.socketEvents.SESSION_CREATED, {
            session: sessionPayload,
            order: orderPayload,
            offer: {
                _id: offer._id.toString(),
                orderId: offer.orderId.toString(),
                supplierId: offer.supplierId.toString(),
                amount: offer.amount,
                status: offer.status,
            },
            meta: {
                trigger: "order_accepted_direct",
                timestamp: new Date(),
            },
        });
        await Promise.all([
            offer_event_service_1.OfferEventService.emitSupplierPendingCountUpdate(supplierId),
            offer_event_service_1.OfferEventService.emitSupplierPendingOffersList(supplierId),
        ]);
        return {
            success: true,
            message: "Order accepted successfully",
            offer: {
                _id: offer._id.toString(),
                orderId: offer.orderId.toString(),
                supplierId: offer.supplierId.toString(),
                amount: offer.amount,
                status: offer.status,
            },
            session: sessionPayload,
            order: orderPayload,
            withdrawnOffers: {
                count: supplierPendingOffers.length,
                orders: supplierPendingOffers.map((o) => o.orderId.toString()),
            },
        };
    }
    static async getAcceptedOfferHistory(input) {
        const { supplierId, page = 1, limit = 20 } = input;
        const [offers, total] = await Promise.all([
            offer_repository_1.OfferRepository.findSupplierAcceptedOffersHistory(supplierId, page, limit),
            offer_repository_1.OfferRepository.countSupplierAcceptedOffersHistory(supplierId),
        ]);
        const enrichedOffers = await Promise.all(offers.map(async (offer) => {
            const [order, session] = await Promise.all([
                Order_model_1.default.findById(offer.orderId),
                session_model_1.default.findOne({ offerId: offer._id }),
            ]);
            return {
                ...offer.toObject(),
                order: order || null,
                session: session || null,
            };
        }));
        return {
            success: true,
            data: enrichedOffers,
            meta: {
                page,
                limit,
                total,
                count: enrichedOffers.length,
                hasNextPage: page * limit < total,
            },
        };
    }
    static async getSupplierPendingOffers(input) {
        const { supplierId, page = 1, limit = 20 } = input;
        const [offers, total, activeAcceptedOffer] = await Promise.all([
            offer_repository_1.OfferRepository.findSupplierPendingOffersPaginated(supplierId, page, limit),
            offer_repository_1.OfferRepository.countPendingOffersBySupplier(supplierId),
            offer_repository_1.OfferRepository.findAcceptedOfferBySupplier(supplierId),
        ]);
        const enrichedOffers = await Promise.all(offers.map(async (offer) => {
            const order = await Order_model_1.default.findById(offer.orderId).lean();
            return {
                ...offer.toObject(),
                order: order || null,
            };
        }));
        return {
            success: true,
            data: enrichedOffers,
            meta: {
                page,
                limit,
                total,
                count: enrichedOffers.length,
                hasNextPage: page * limit < total,
            },
            stats: {
                totalPending: total,
                hasActiveJob: !!activeAcceptedOffer,
            },
        };
    }
}
exports.OfferService = OfferService;

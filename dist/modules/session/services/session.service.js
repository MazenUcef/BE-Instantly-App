"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Order_model_1 = __importDefault(require("../../order/models/Order.model"));
const Offer_model_1 = __importDefault(require("../../offer/models/Offer.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const session_repository_1 = require("../repositories/session.repository");
const session_event_service_1 = require("./session-event.service");
const order_repository_1 = require("../../order/repositories/order.repository");
const order_event_service_1 = require("../../order/services/order-event.service");
const socket_1 = require("../../../shared/config/socket");
const session_constants_1 = require("../../../shared/constants/session.constants");
const order_constants_1 = require("../../../shared/constants/order.constants");
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const session_state_1 = require("../helper/session-state");
const SESSION_STATUS_TO_TIMESTAMP_FIELD = {
    [session_constants_1.SESSION_STATUS.ON_THE_WAY]: "onTheWayAt",
    [session_constants_1.SESSION_STATUS.ARRIVED]: "arrivedAt",
    [session_constants_1.SESSION_STATUS.WORK_STARTED]: "workStartedAt",
};
const populateSessionData = async (session) => {
    if (!session)
        return null;
    const sessionObj = session.toObject ? session.toObject() : session;
    const [order, offer, customer, supplier] = await Promise.all([
        Order_model_1.default.findById(session.orderId)
            .populate("categoryId", "name icon")
            .populate("governmentId", "name nameAr")
            .lean(),
        Offer_model_1.default.findById(session.offerId).lean(),
        User_model_1.default.findById(session.customerId)
            .select("-password -refreshToken -biometrics")
            .lean(),
        User_model_1.default.findById(session.supplierId)
            .select("-password -refreshToken -biometrics")
            .lean(),
    ]);
    return {
        ...sessionObj,
        order: order || null,
        offer: offer || null,
        customer: customer || null,
        supplier: supplier || null,
    };
};
class SessionService {
    static ensureParticipant(session, userId) {
        const isParticipant = session.customerId.toString() === userId ||
            session.supplierId.toString() === userId;
        if (!isParticipant) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
    }
    static ensureSupplier(session, userId) {
        if (session.supplierId.toString() !== userId) {
            throw new errorHandler_1.AppError("Only supplier can do this action", 403);
        }
    }
    static async validateSessionCreationInput(input, dbSession) {
        const [order, offer] = await Promise.all([
            Order_model_1.default.findById(input.orderId).session(dbSession),
            Offer_model_1.default.findById(input.offerId).session(dbSession),
        ]);
        if (!order) {
            throw new errorHandler_1.AppError("Order not found", 404);
        }
        if (!offer) {
            throw new errorHandler_1.AppError("Offer not found", 404);
        }
        if (String(order._id) !== String(offer.orderId)) {
            throw new errorHandler_1.AppError("Offer does not belong to this order", 400);
        }
        if (String(order.customerId) !== String(input.customerId)) {
            throw new errorHandler_1.AppError("Customer mismatch for order", 400);
        }
        if (String(offer.supplierId) !== String(input.supplierId)) {
            throw new errorHandler_1.AppError("Supplier mismatch for offer", 400);
        }
        if (order.status !== order_constants_1.ORDER_STATUS.IN_PROGRESS) {
            throw new errorHandler_1.AppError("Order must be in progress before creating session", 409);
        }
        if (offer.status !== offer_constants_1.OFFER_STATUS.ACCEPTED) {
            throw new errorHandler_1.AppError("Offer must be accepted before creating session", 409);
        }
        const existingOrderSession = await session_repository_1.SessionRepository.findByOrderId(input.orderId, dbSession);
        if (existingOrderSession) {
            throw new errorHandler_1.AppError("Session already exists for this order", 409);
        }
        const existingOfferSession = await session_repository_1.SessionRepository.findByOfferId(input.offerId, dbSession);
        if (existingOfferSession) {
            throw new errorHandler_1.AppError("Session already exists for this offer", 409);
        }
        return { order, offer };
    }
    static async createSession(input) {
        const { orderId, offerId, customerId, supplierId } = input;
        const dbSession = await mongoose_1.default.startSession();
        let createdSession;
        try {
            await dbSession.withTransaction(async () => {
                await this.validateSessionCreationInput({ orderId, offerId, customerId, supplierId }, dbSession);
                const existingCustomerSession = await session_repository_1.SessionRepository.findActiveByUser(customerId, dbSession);
                if (existingCustomerSession &&
                    existingCustomerSession.customerId.toString() === customerId) {
                    throw new errorHandler_1.AppError("Customer already has an active session", 400);
                }
                const existingSupplierSession = await session_repository_1.SessionRepository.findActiveByUser(supplierId, dbSession);
                if (existingSupplierSession &&
                    existingSupplierSession.supplierId.toString() === supplierId) {
                    throw new errorHandler_1.AppError("Supplier already has an active session", 400);
                }
                createdSession = await session_repository_1.SessionRepository.createSession({
                    orderId,
                    offerId,
                    customerId,
                    supplierId,
                    status: session_constants_1.SESSION_STATUS.STARTED,
                    startedAt: new Date(),
                }, dbSession);
            });
        }
        catch (error) {
            if (error?.code === 11000) {
                throw new errorHandler_1.AppError("Session already exists or active session conflict occurred", 409);
            }
            throw error;
        }
        finally {
            await dbSession.endSession();
        }
        const populatedSession = await populateSessionData(createdSession);
        await session_event_service_1.SessionEventService.notifySessionCreated(populatedSession);
        return {
            success: true,
            message: "Session created successfully",
            data: populatedSession,
        };
    }
    static async getSessionById(input) {
        const session = await session_repository_1.SessionRepository.findById(input.sessionId);
        if (!session) {
            throw new errorHandler_1.AppError("Session not found", 404);
        }
        this.ensureParticipant(session, input.userId);
        const populatedSession = await populateSessionData(session);
        return {
            success: true,
            data: { session: populatedSession },
        };
    }
    static async getActiveSessionForUser(input) {
        if (input.requestedUserId !== input.actorUserId) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        const session = await session_repository_1.SessionRepository.findActiveByUser(input.actorUserId);
        if (!session) {
            return {
                success: true,
                active: false,
            };
        }
        const populatedSession = await populateSessionData(session);
        return {
            success: true,
            active: true,
            data: { session: populatedSession },
        };
    }
    static async updateSessionStatus(input) {
        const { sessionId, actorUserId, nextStatus, reason } = input;
        const dbSession = await mongoose_1.default.startSession();
        let updatedSession;
        let cancelledBy = null;
        let relatedOrder = null;
        try {
            await dbSession.withTransaction(async () => {
                const session = await session_repository_1.SessionRepository.findById(sessionId, dbSession);
                if (!session) {
                    throw new errorHandler_1.AppError("Session not found", 404);
                }
                this.ensureParticipant(session, actorUserId);
                if (nextStatus === session_constants_1.SESSION_STATUS.CANCELLED) {
                    if (!(0, session_state_1.canCancelSession)(session.status)) {
                        throw new errorHandler_1.AppError("Session cannot be cancelled now", 400);
                    }
                    const isCustomer = session.customerId.toString() === actorUserId;
                    cancelledBy = isCustomer
                        ? session_constants_1.SESSION_CANCELLED_BY.CUSTOMER
                        : session_constants_1.SESSION_CANCELLED_BY.SUPPLIER;
                    updatedSession = await session_repository_1.SessionRepository.markCancelled(sessionId, session.status, cancelledBy, reason, dbSession);
                    if (!updatedSession) {
                        throw new errorHandler_1.AppError("Failed to cancel session", 409);
                    }
                    relatedOrder = await Order_model_1.default.findById(session.orderId).session(dbSession);
                    if (!relatedOrder) {
                        throw new errorHandler_1.AppError("Associated order not found", 404);
                    }
                    await Offer_model_1.default.findByIdAndUpdate(session.offerId, {
                        $set: {
                            status: offer_constants_1.OFFER_STATUS.REJECTED,
                            rejectedAt: new Date(),
                        },
                    }, { session: dbSession, new: true });
                    if (isCustomer) {
                        await Offer_model_1.default.updateMany({
                            orderId: relatedOrder._id,
                            status: offer_constants_1.OFFER_STATUS.PENDING,
                        }, {
                            $set: {
                                status: offer_constants_1.OFFER_STATUS.REJECTED,
                                rejectedAt: new Date(),
                            },
                        }, { session: dbSession });
                        await order_repository_1.OrderRepository.markCancelled({
                            orderId: relatedOrder._id,
                            cancelledBy: order_constants_1.ORDER_CANCELLED_BY.CUSTOMER,
                            cancellationReason: reason || "customer_cancelled_session",
                        }, dbSession);
                    }
                    else {
                        await order_repository_1.OrderRepository.resetToPending(relatedOrder._id, dbSession);
                    }
                    return;
                }
                this.ensureSupplier(session, actorUserId);
                (0, session_state_1.assertValidSessionTransition)(session.status, nextStatus);
                const timestampField = SESSION_STATUS_TO_TIMESTAMP_FIELD[nextStatus];
                const extraSet = timestampField ? { [timestampField]: new Date() } : {};
                updatedSession = await session_repository_1.SessionRepository.updateStatus(sessionId, session.status, nextStatus, extraSet, dbSession);
                if (!updatedSession) {
                    throw new errorHandler_1.AppError("Failed to update session status", 409);
                }
            });
        }
        finally {
            await dbSession.endSession();
        }
        const populatedSession = await populateSessionData(updatedSession);
        if (nextStatus !== session_constants_1.SESSION_STATUS.CANCELLED) {
            session_event_service_1.SessionEventService.emitSessionToParticipants(socket_1.socketEvents.SESSION_STATUS_UPDATED, populatedSession, { status: nextStatus });
            await session_event_service_1.SessionEventService.notifySessionStatusUpdated(populatedSession, nextStatus);
            return {
                success: true,
                message: `Session status updated to "${nextStatus}"`,
                data: { session: populatedSession },
            };
        }
        // Emit cancellation events using standard envelopes
        if (cancelledBy === session_constants_1.SESSION_CANCELLED_BY.CUSTOMER && relatedOrder) {
            await order_event_service_1.OrderEventService.emitOrderCancelled(relatedOrder._id.toString(), relatedOrder.categoryId.toString(), relatedOrder.governmentId.toString(), {
                actorId: actorUserId,
                actorRole: "customer",
                reason: reason || "customer_cancelled_session",
            });
        }
        if (cancelledBy === session_constants_1.SESSION_CANCELLED_BY.SUPPLIER && relatedOrder) {
            await order_event_service_1.OrderEventService.emitOrderAvailableAgain(relatedOrder._id.toString(), relatedOrder.categoryId.toString(), relatedOrder.governmentId.toString(), reason || "supplier_cancelled_session");
        }
        session_event_service_1.SessionEventService.emitSessionCancelled(populatedSession, {
            actorRole: cancelledBy,
            actorId: actorUserId,
            reason,
        });
        await session_event_service_1.SessionEventService.notifySessionCancelled(populatedSession, cancelledBy);
        return {
            success: true,
            message: cancelledBy === session_constants_1.SESSION_CANCELLED_BY.CUSTOMER
                ? "Session cancelled and order cancelled"
                : "Session cancelled and order returned to pending",
            data: {
                session: populatedSession,
                orderStatus: cancelledBy === session_constants_1.SESSION_CANCELLED_BY.SUPPLIER
                    ? order_constants_1.ORDER_STATUS.PENDING
                    : order_constants_1.ORDER_STATUS.CANCELLED,
                cancelledBy,
            },
        };
    }
    static async completeSession(input) {
        const { sessionId, actorUserId } = input;
        const dbSession = await mongoose_1.default.startSession();
        let completedSession;
        try {
            await dbSession.withTransaction(async () => {
                const session = await session_repository_1.SessionRepository.findById(sessionId, dbSession);
                if (!session) {
                    throw new errorHandler_1.AppError("Session not found", 404);
                }
                this.ensureSupplier(session, actorUserId);
                if (!(0, session_state_1.canCompleteSession)(session.status)) {
                    throw new errorHandler_1.AppError("Session can only be completed after work has started", 400);
                }
                completedSession = await session_repository_1.SessionRepository.markCompleted(sessionId, dbSession);
                if (!completedSession) {
                    throw new errorHandler_1.AppError("Failed to complete session", 409);
                }
                await Promise.all([
                    Order_model_1.default.findByIdAndUpdate(session.orderId, {
                        $set: {
                            status: order_constants_1.ORDER_STATUS.COMPLETED,
                            completedAt: new Date(),
                        },
                    }, { new: true, session: dbSession }),
                    Offer_model_1.default.findByIdAndUpdate(session.offerId, {
                        $set: {
                            status: offer_constants_1.OFFER_STATUS.COMPLETED,
                            completedAt: new Date(),
                        },
                    }, { new: true, session: dbSession }),
                ]);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const populatedSession = await populateSessionData(completedSession);
        session_event_service_1.SessionEventService.emitSessionToParticipants(socket_1.socketEvents.SESSION_COMPLETED, populatedSession);
        await session_event_service_1.SessionEventService.notifySessionCompleted(populatedSession);
        return {
            success: true,
            message: "Session completed successfully",
            data: { session: populatedSession },
        };
    }
    static async getSessionByOrder(input) {
        const session = await session_repository_1.SessionRepository.findByOrderId(input.orderId);
        if (!session) {
            throw new errorHandler_1.AppError("Session not found", 404);
        }
        this.ensureParticipant(session, input.userId);
        const populatedSession = await populateSessionData(session);
        return {
            success: true,
            data: { session: populatedSession },
        };
    }
    static async confirmSessionPayment(input) {
        const { sessionId, userId, userRole } = input;
        if (userRole !== "supplier") {
            throw new errorHandler_1.AppError("Only supplier can confirm payment", 403);
        }
        const dbSession = await mongoose_1.default.startSession();
        let updatedSession;
        try {
            await dbSession.withTransaction(async () => {
                const session = await session_repository_1.SessionRepository.findById(sessionId, dbSession);
                if (!session) {
                    throw new errorHandler_1.AppError("Session not found", 404);
                }
                if (session.supplierId.toString() !== userId) {
                    throw new errorHandler_1.AppError("Not allowed to confirm payment for this session", 403);
                }
                if (!(0, session_state_1.canConfirmSessionPayment)(session.status)) {
                    throw new errorHandler_1.AppError("Payment can only be confirmed after session completion", 400);
                }
                updatedSession = await session_repository_1.SessionRepository.confirmPayment(sessionId, dbSession);
                if (!updatedSession) {
                    throw new errorHandler_1.AppError("Payment already confirmed", 409);
                }
            });
        }
        finally {
            await dbSession.endSession();
        }
        const populatedSession = await populateSessionData(updatedSession);
        session_event_service_1.SessionEventService.emitSessionToParticipants(socket_1.socketEvents.SESSION_PAYMENT_CONFIRMED, populatedSession);
        await session_event_service_1.SessionEventService.notifyPaymentConfirmed(populatedSession);
        return {
            success: true,
            message: "Payment confirmed successfully",
            data: { session: populatedSession },
        };
    }
    static async getResumeSessionForUser(input) {
        if (input.requestedUserId !== input.actorUserId) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        const session = await session_repository_1.SessionRepository.findLatestByUser(input.actorUserId);
        if (!session) {
            return {
                success: true,
                hasAction: false,
                action: session_constants_1.SESSION_RESUME_ACTION.NONE,
                session: null,
            };
        }
        const populatedSession = await populateSessionData(session);
        const order = populatedSession?.order;
        const isCustomer = String(session.customerId) === String(input.actorUserId);
        const isSupplier = String(session.supplierId) === String(input.actorUserId);
        if (![session_constants_1.SESSION_STATUS.COMPLETED, session_constants_1.SESSION_STATUS.CANCELLED].includes(session.status)) {
            return {
                success: true,
                hasAction: true,
                action: session_constants_1.SESSION_RESUME_ACTION.JOB_SESSION,
                session: populatedSession,
            };
        }
        if (session.status === session_constants_1.SESSION_STATUS.COMPLETED) {
            if (isCustomer && !order?.customerReviewed) {
                return {
                    success: true,
                    hasAction: true,
                    action: session_constants_1.SESSION_RESUME_ACTION.REVIEW,
                    session: populatedSession,
                };
            }
            if (isSupplier && !session.paymentConfirmed) {
                return {
                    success: true,
                    hasAction: true,
                    action: session_constants_1.SESSION_RESUME_ACTION.PAYMENT_CONFIRMATION,
                    session: populatedSession,
                };
            }
            if (isSupplier && session.paymentConfirmed && !order?.supplierReviewed) {
                return {
                    success: true,
                    hasAction: true,
                    action: session_constants_1.SESSION_RESUME_ACTION.REVIEW,
                    session: populatedSession,
                };
            }
        }
        return {
            success: true,
            hasAction: false,
            action: session_constants_1.SESSION_RESUME_ACTION.NONE,
            session: populatedSession,
        };
    }
}
exports.SessionService = SessionService;

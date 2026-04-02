"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const order_model_1 = __importDefault(require("../../order/models/order.model"));
const Offer_model_1 = __importDefault(require("../../offer/models/Offer.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const session_repository_1 = require("../repositories/session.repository");
const session_event_service_1 = require("./session-event.service");
const buildSupplierOrderPayload_1 = require("../../../shared/utils/buildSupplierOrderPayload");
const socket_1 = require("../../../shared/config/socket");
const session_constants_1 = require("../../../shared/constants/session.constants");
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
        order_model_1.default.findById(session.orderId)
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
    static ensureValidProgressTransition(currentStatus, nextStatus) {
        const transitions = {
            [session_constants_1.SESSION_STATUS.STARTED]: [session_constants_1.SESSION_STATUS.ON_THE_WAY],
            [session_constants_1.SESSION_STATUS.ON_THE_WAY]: [session_constants_1.SESSION_STATUS.ARRIVED],
            [session_constants_1.SESSION_STATUS.ARRIVED]: [session_constants_1.SESSION_STATUS.WORK_STARTED],
            [session_constants_1.SESSION_STATUS.WORK_STARTED]: [],
        };
        const allowedNext = transitions[currentStatus] || [];
        if (!allowedNext.includes(nextStatus)) {
            throw new errorHandler_1.AppError(`Invalid session status transition from "${currentStatus}" to "${nextStatus}"`, 400);
        }
    }
    static async createSession(input) {
        const { orderId, offerId, customerId, supplierId } = input;
        const dbSession = await mongoose_1.default.startSession();
        let createdSession;
        try {
            await dbSession.withTransaction(async () => {
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
            data: populatedSession,
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
            session: populatedSession,
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
                    const isCustomer = session.customerId.toString() === actorUserId;
                    const isSupplier = session.supplierId.toString() === actorUserId;
                    cancelledBy = isCustomer ? "customer" : "supplier";
                    updatedSession = await session_repository_1.SessionRepository.markCancelled(sessionId, cancelledBy, reason, dbSession);
                    if (!updatedSession) {
                        throw new errorHandler_1.AppError("Failed to cancel session", 409);
                    }
                    relatedOrder = await order_model_1.default.findById(session.orderId).session(dbSession || null);
                    if (!relatedOrder) {
                        throw new errorHandler_1.AppError("Associated order not found", 404);
                    }
                    await Offer_model_1.default.findByIdAndUpdate(session.offerId, { status: "rejected", rejectedAt: new Date() }, { session: dbSession, new: true });
                    if (isCustomer) {
                        await Offer_model_1.default.updateMany({ orderId: relatedOrder._id, status: "pending" }, { $set: { status: "rejected", rejectedAt: new Date() } }, { session: dbSession });
                        await order_model_1.default.findByIdAndDelete(relatedOrder._id, {
                            session: dbSession,
                        });
                    }
                    if (isSupplier) {
                        await order_model_1.default.findByIdAndUpdate(relatedOrder._id, { status: "pending", supplierId: null }, { session: dbSession, new: true });
                    }
                    return;
                }
                this.ensureSupplier(session, actorUserId);
                this.ensureValidProgressTransition(session.status, nextStatus);
                const timestampField = SESSION_STATUS_TO_TIMESTAMP_FIELD[nextStatus];
                const extraSet = timestampField ? { [timestampField]: new Date() } : {};
                updatedSession = await session_repository_1.SessionRepository.updateStatus(sessionId, nextStatus, extraSet, dbSession);
                if (!updatedSession) {
                    throw new errorHandler_1.AppError("Failed to update session status", 409);
                }
            });
        }
        finally {
            await dbSession.endSession();
        }
        const populatedSession = await populateSessionData(updatedSession);
        const io = (0, socket_1.getIO)();
        if (nextStatus !== session_constants_1.SESSION_STATUS.CANCELLED) {
            session_event_service_1.SessionEventService.emitSessionToParticipants(socket_1.socketEvents.SESSION_STATUS_UPDATED, populatedSession, { status: nextStatus });
            await session_event_service_1.SessionEventService.notifySessionStatusUpdated(populatedSession, nextStatus);
            return {
                success: true,
                message: `Session status updated to "${nextStatus}"`,
                session: populatedSession,
            };
        }
        if (cancelledBy === "customer" && relatedOrder) {
            io.to(socket_1.socketRooms.supplierOrders(relatedOrder.categoryId.toString(), relatedOrder.governmentId.toString())).emit(socket_1.socketEvents.ORDER_DELETED, {
                orderId: relatedOrder._id.toString(),
                reason: "customer_cancelled_session",
                timestamp: new Date(),
            });
        }
        if (cancelledBy === "supplier" && relatedOrder) {
            const supplierOrderPayload = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(relatedOrder._id.toString());
            if (supplierOrderPayload) {
                io.to(socket_1.socketRooms.supplierOrders(relatedOrder.categoryId.toString(), relatedOrder.governmentId.toString())).emit(socket_1.socketEvents.ORDER_AVAILABLE_AGAIN, {
                    orderId: relatedOrder._id.toString(),
                    order: supplierOrderPayload,
                    reason: "supplier_cancelled_session",
                    timestamp: new Date(),
                });
            }
        }
        session_event_service_1.SessionEventService.emitSessionToParticipants(socket_1.socketEvents.SESSION_CANCELLED, populatedSession, { cancelledBy });
        await session_event_service_1.SessionEventService.notifySessionCancelled(populatedSession, cancelledBy);
        return {
            success: true,
            message: cancelledBy === "customer"
                ? "Session cancelled and order deleted"
                : "Session cancelled and order returned to pending",
            session: populatedSession,
            orderStatus: cancelledBy === "supplier" ? "pending" : "deleted",
            cancelledBy,
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
                if (session.status !== session_constants_1.SESSION_STATUS.WORK_STARTED) {
                    throw new errorHandler_1.AppError("Session can only be completed after work has started", 400);
                }
                completedSession = await session_repository_1.SessionRepository.markCompleted(sessionId, dbSession);
                if (!completedSession) {
                    throw new errorHandler_1.AppError("Failed to complete session", 409);
                }
                await Promise.all([
                    order_model_1.default.findByIdAndUpdate(session.orderId, { status: "completed" }, { new: true, session: dbSession }),
                    Offer_model_1.default.findByIdAndUpdate(session.offerId, { status: "completed", completedAt: new Date() }, { new: true, session: dbSession }),
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
            session: populatedSession,
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
            data: populatedSession,
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
                if (session.status !== session_constants_1.SESSION_STATUS.COMPLETED) {
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
            session: populatedSession,
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
                action: "none",
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
                action: "job_session",
                session: populatedSession,
            };
        }
        if (session.status === session_constants_1.SESSION_STATUS.COMPLETED) {
            if (isCustomer && !order?.customerReviewed) {
                return {
                    success: true,
                    hasAction: true,
                    action: "review",
                    session: populatedSession,
                };
            }
            if (isSupplier && !session.paymentConfirmed) {
                return {
                    success: true,
                    hasAction: true,
                    action: "payment_confirmation",
                    session: populatedSession,
                };
            }
            if (isSupplier && session.paymentConfirmed && !order?.supplierReviewed) {
                return {
                    success: true,
                    hasAction: true,
                    action: "review",
                    session: populatedSession,
                };
            }
        }
        return {
            success: true,
            hasAction: false,
            action: "none",
            session: populatedSession,
        };
    }
}
exports.SessionService = SessionService;

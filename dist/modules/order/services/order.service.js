"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const Offer_model_1 = __importDefault(require("../../offer/models/Offer.model"));
const Government_model_1 = __importDefault(require("../../government/models/Government.model"));
const Category_model_1 = __importDefault(require("../../category/models/Category.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const order_repository_1 = require("../repositories/order.repository");
const order_event_service_1 = require("./order-event.service");
const buildSupplierOrderPayload_1 = require("../../../shared/utils/buildSupplierOrderPayload");
const order_constants_1 = require("../../../shared/constants/order.constants");
const socket_1 = require("../../../shared/config/socket");
const session_constants_1 = require("../../../shared/constants/session.constants");
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const session_event_service_1 = require("../../session/services/session-event.service");
const order_state_1 = require("../helpers/order-state");
class OrderService {
    static async validateOrderDependencies(input) {
        const [government, category] = await Promise.all([
            Government_model_1.default.findById(input.governmentId),
            Category_model_1.default.findById(input.categoryId),
        ]);
        if (!government) {
            throw new errorHandler_1.AppError("Invalid government", 400);
        }
        if (!category) {
            const error = new errorHandler_1.AppError("Invalid category", 400);
            throw error;
        }
        if (!category.jobs || !category.jobs.includes(input.jobTitle)) {
            const error = new errorHandler_1.AppError("Invalid job title for this category", 400);
            error.availableJobTitles = category.jobs || [];
            throw error;
        }
        return { government, category };
    }
    static async ensureCustomerCanCreateOrder(customerId, dbSession) {
        const [existingActiveOrder, unfinishedReview] = await Promise.all([
            order_repository_1.OrderRepository.findCustomerActiveOrder(customerId, dbSession),
            order_repository_1.OrderRepository.findCustomerPendingReviewOrder(customerId, dbSession),
        ]);
        if (existingActiveOrder) {
            throw new errorHandler_1.AppError("You already have an active order. Please complete it before creating a new one.", 400);
        }
        if (unfinishedReview) {
            const error = new errorHandler_1.AppError("You have to review and rate your last order", 403);
            error.reviewRequired = true;
            error.order = unfinishedReview;
            throw error;
        }
    }
    static async createOrder(input) {
        const { customerId, customerName, address, description, categoryId, governmentId, requestedPrice, timeToStart, jobTitle, orderType, } = input;
        const dbSession = await mongoose_1.default.startSession();
        let order;
        try {
            await dbSession.withTransaction(async () => {
                if (!requestedPrice || requestedPrice <= 0) {
                    throw new errorHandler_1.AppError("Price is required", 400);
                }
                await this.validateOrderDependencies({
                    categoryId,
                    governmentId,
                    jobTitle,
                });
                await this.ensureCustomerCanCreateOrder(customerId, dbSession);
                order = await order_repository_1.OrderRepository.createOrder({
                    customerId,
                    customerName,
                    address,
                    description,
                    categoryId,
                    governmentId,
                    jobTitle,
                    requestedPrice,
                    timeToStart: timeToStart || null,
                    orderType,
                    status: order_constants_1.ORDER_STATUS.PENDING,
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const payload = await order_event_service_1.OrderEventService.emitOrderCreated(order._id.toString(), categoryId, governmentId);
        return {
            success: true,
            message: "Order created successfully",
            data: {
                ...payload,
                selectedJobTitle: jobTitle,
            },
        };
    }
    static async updateOrderPrice(input) {
        const { orderId, customerId, requestedPrice } = input;
        const order = await order_repository_1.OrderRepository.findById(orderId);
        if (!order) {
            throw new errorHandler_1.AppError("Order not found", 404);
        }
        if (order.customerId.toString() !== customerId) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        if (order.status !== order_constants_1.ORDER_STATUS.PENDING) {
            throw new errorHandler_1.AppError("Cannot update price now", 400);
        }
        const updatedOrder = await order_repository_1.OrderRepository.updateRequestedPrice(orderId, requestedPrice);
        if (!updatedOrder) {
            throw new errorHandler_1.AppError("Order could not be updated", 409);
        }
        const payload = await order_event_service_1.OrderEventService.emitOrderUpdated(updatedOrder._id.toString(), updatedOrder.categoryId.toString(), updatedOrder.governmentId.toString());
        return {
            success: true,
            message: "Price updated successfully",
            data: payload,
        };
    }
    static async cancelOrder(input) {
        const { orderId, customerId, cancellationReason } = input;
        const dbSession = await mongoose_1.default.startSession();
        let cancelledOrder = null;
        let activeSession = null;
        let acceptedOffer = null;
        let pendingOffers = [];
        let flowType = null;
        try {
            await dbSession.withTransaction(async () => {
                const order = await order_repository_1.OrderRepository.findById(orderId, dbSession);
                if (!order) {
                    throw new errorHandler_1.AppError("Order not found", 404);
                }
                if (order.customerId.toString() !== customerId) {
                    throw new errorHandler_1.AppError("Not allowed", 403);
                }
                if (!(0, order_state_1.canCustomerCancelOrder)(order.status)) {
                    throw new errorHandler_1.AppError("Only pending or in-progress orders can be cancelled by customer", 400);
                }
                (0, order_state_1.assertValidOrderTransition)(order.status, order_constants_1.ORDER_STATUS.CANCELLED);
                pendingOffers = await Offer_model_1.default.find({
                    orderId: order._id,
                    status: offer_constants_1.OFFER_STATUS.PENDING,
                }).session(dbSession || null);
                activeSession = await session_model_1.default
                    .findOne({
                    orderId: order._id,
                    status: {
                        $nin: [session_constants_1.SESSION_STATUS.CANCELLED, session_constants_1.SESSION_STATUS.COMPLETED],
                    },
                })
                    .session(dbSession || null);
                acceptedOffer = await Offer_model_1.default.findOne({
                    orderId: order._id,
                    status: offer_constants_1.OFFER_STATUS.ACCEPTED,
                }).session(dbSession || null);
                await Offer_model_1.default.updateMany({ orderId: order._id, status: offer_constants_1.OFFER_STATUS.PENDING }, {
                    $set: {
                        status: offer_constants_1.OFFER_STATUS.REJECTED,
                        rejectedAt: new Date(),
                    },
                }, { session: dbSession });
                if (acceptedOffer) {
                    acceptedOffer.status = offer_constants_1.OFFER_STATUS.REJECTED;
                    acceptedOffer.rejectedAt = new Date();
                    await acceptedOffer.save({ session: dbSession });
                }
                if (activeSession) {
                    await session_model_1.default.findOneAndUpdate({
                        _id: activeSession._id,
                        status: {
                            $nin: [session_constants_1.SESSION_STATUS.CANCELLED, session_constants_1.SESSION_STATUS.COMPLETED],
                        },
                    }, {
                        $set: {
                            status: session_constants_1.SESSION_STATUS.CANCELLED,
                            cancelledBy: session_constants_1.SESSION_CANCELLED_BY.CUSTOMER,
                            cancellationReason: cancellationReason || "customer_cancelled_order",
                            cancelledAt: new Date(),
                        },
                    }, { session: dbSession, new: true });
                }
                cancelledOrder = await order_repository_1.OrderRepository.markCancelled({
                    orderId,
                    customerId,
                    cancelledBy: order_constants_1.ORDER_CANCELLED_BY.CUSTOMER,
                    cancellationReason: cancellationReason || "customer_cancelled_order",
                }, dbSession);
                if (!cancelledOrder) {
                    throw new errorHandler_1.AppError("Order not found or already cancelled", 409);
                }
                flowType =
                    order.status === order_constants_1.ORDER_STATUS.IN_PROGRESS
                        ? "cancel_active_session_and_order"
                        : "pending_cancel";
            });
        }
        finally {
            await dbSession.endSession();
        }
        const io = (0, socket_1.getIO)();
        await order_event_service_1.OrderEventService.notifySuppliersOrderCancelled(pendingOffers, cancelledOrder._id.toString(), "order_cancelled_by_customer");
        if (acceptedOffer?.supplierId) {
            io.to(socket_1.socketRooms.user(acceptedOffer.supplierId.toString())).emit(socket_1.socketEvents.OFFER_REJECTED, {
                offerId: acceptedOffer._id.toString(),
                orderId: cancelledOrder._id.toString(),
                reason: "order_cancelled_by_customer",
                timestamp: new Date(),
            });
        }
        if (activeSession) {
            const sessionPayload = {
                _id: activeSession._id.toString(),
                orderId: activeSession.orderId.toString(),
                offerId: activeSession.offerId.toString(),
                customerId: activeSession.customerId.toString(),
                supplierId: activeSession.supplierId.toString(),
                status: session_constants_1.SESSION_STATUS.CANCELLED,
                cancelledBy: session_constants_1.SESSION_CANCELLED_BY.CUSTOMER,
                cancellationReason: activeSession.cancellationReason || "customer_cancelled_order",
                cancelledAt: activeSession.cancelledAt,
            };
            session_event_service_1.SessionEventService.emitSessionCancelled(sessionPayload, {
                actorRole: session_constants_1.SESSION_CANCELLED_BY.CUSTOMER,
                actorId: customerId,
                reason: cancellationReason || "customer_cancelled_order",
            });
        }
        await order_event_service_1.OrderEventService.emitOrderCancelled(cancelledOrder._id.toString(), cancelledOrder.categoryId.toString(), cancelledOrder.governmentId.toString(), {
            actorId: customerId,
            actorRole: "customer",
            reason: cancelledOrder.cancellationReason || "customer_cancelled_order",
        });
        return {
            success: true,
            message: flowType === "cancel_active_session_and_order"
                ? "Order cancelled and active session cancelled successfully"
                : "Order cancelled successfully",
            data: {
                orderId: cancelledOrder._id.toString(),
                orderStatus: cancelledOrder.status,
                sessionId: activeSession?._id?.toString() || null,
            },
        };
    }
    static async getActiveOrdersByCategory(input) {
        const { supplierId, supplierCategoryId, supplierGovernmentIds } = input;
        if (!supplierGovernmentIds || supplierGovernmentIds.length === 0) {
            return {
                success: true,
                type: "orders_list",
                ordersWithOffers: [],
                availableOrders: [],
                count: {
                    ordersWithOffers: 0,
                    availableOrders: 0,
                    total: 0,
                },
            };
        }
        const activeAcceptedOffer = await Offer_model_1.default.findOne({
            supplierId,
            status: "accepted",
        }).sort({ createdAt: -1 });
        if (activeAcceptedOffer) {
            const activeOrder = await (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(activeAcceptedOffer.orderId.toString());
            if (!activeOrder) {
                throw new errorHandler_1.AppError("Active order not found", 404);
            }
            return {
                success: true,
                type: "active_job",
                order: activeOrder,
                activeAcceptedOffer: true,
            };
        }
        const [allPendingOrders, supplierPendingOffers] = await Promise.all([
            order_repository_1.OrderRepository.findPendingOrdersForSupplierFeed({
                categoryId: supplierCategoryId,
                governmentIds: supplierGovernmentIds,
                excludeCustomerId: supplierId,
            }),
            Offer_model_1.default.find({
                supplierId,
                status: "pending",
            }).select("orderId"),
        ]);
        const orderIdsWithOffers = new Set(supplierPendingOffers.map((offer) => offer.orderId.toString()));
        const payloads = await Promise.all(allPendingOrders.map((order) => (0, buildSupplierOrderPayload_1.buildSupplierOrderPayload)(order._id.toString())));
        const validPayloads = payloads.filter(Boolean);
        const ordersWithOffers = [];
        const availableOrders = [];
        for (const payload of validPayloads) {
            if (!payload)
                continue;
            if (orderIdsWithOffers.has(payload._id.toString())) {
                ordersWithOffers.push(payload);
            }
            else {
                availableOrders.push(payload);
            }
        }
        return {
            success: true,
            type: "orders_list",
            ordersWithOffers,
            availableOrders,
            count: {
                ordersWithOffers: ordersWithOffers.length,
                availableOrders: availableOrders.length,
                total: ordersWithOffers.length + availableOrders.length,
            },
        };
    }
    static async getOrderDetails(input) {
        const order = await order_repository_1.OrderRepository.findById(input.orderId);
        if (!order) {
            throw new errorHandler_1.AppError("Order not found", 404);
        }
        if (input.role === "customer") {
            if (order.customerId.toString() !== input.userId) {
                throw new errorHandler_1.AppError("Not allowed", 403);
            }
        }
        if (input.role === "supplier") {
            const supplierGovernmentIds = new Set((input.governmentIds || []).map(String));
            if (order.categoryId.toString() !== String(input.categoryId) ||
                !supplierGovernmentIds.has(order.governmentId.toString()) ||
                order.customerId.toString() === input.userId) {
                throw new errorHandler_1.AppError("Not allowed", 403);
            }
        }
        return {
            success: true,
            data: order,
        };
    }
    static async getCustomerOrderHistory(input) {
        const { customerId, page = 1, limit = 20 } = input;
        const [orders, total] = await Promise.all([
            order_repository_1.OrderRepository.findCustomerOrders(customerId, page, limit),
            order_repository_1.OrderRepository.countCustomerOrders(customerId),
        ]);
        return {
            success: true,
            data: orders,
            meta: {
                page,
                limit,
                total,
                count: orders.length,
                hasNextPage: page * limit < total,
            },
        };
    }
    static async checkPendingOrders(input) {
        const { userId } = input;
        const activeOrder = await order_repository_1.OrderRepository.findCustomerActiveOrder(userId);
        if (activeOrder) {
            return {
                success: true,
                hasPendingOrders: true,
                pendingOrder: activeOrder,
                status: activeOrder.status,
                message: "You have an active order",
            };
        }
        const pendingReviewOrder = await order_repository_1.OrderRepository.findCustomerPendingReviewOrder(userId);
        if (pendingReviewOrder) {
            const session = await session_model_1.default.findOne({
                orderId: pendingReviewOrder._id,
            });
            let supplierData = null;
            if (session?.supplierId) {
                supplierData = await User_model_1.default.findById(session.supplierId).select("-password -refreshToken -biometrics");
            }
            return {
                success: true,
                hasPendingOrders: true,
                reviewRequired: true,
                pendingOrder: pendingReviewOrder,
                supplier: supplierData,
                message: "You have a completed order that needs review",
            };
        }
        return {
            success: true,
            hasPendingOrders: false,
            message: "No pending orders found",
        };
    }
}
exports.OrderService = OrderService;

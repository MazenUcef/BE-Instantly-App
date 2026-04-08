"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderRepository = void 0;
const order_constants_1 = require("../../../shared/constants/order.constants");
const Order_model_1 = __importDefault(require("../models/Order.model"));
class OrderRepository {
    static createOrder(data, session) {
        return Order_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(orderId, session) {
        return Order_model_1.default.findById(orderId).session(session || null);
    }
    static findCustomerActiveOrder(customerId, session) {
        return Order_model_1.default.findOne({
            customerId,
            status: { $in: [order_constants_1.ORDER_STATUS.PENDING, order_constants_1.ORDER_STATUS.IN_PROGRESS] },
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static findCustomerPendingReviewOrder(customerId, session) {
        return Order_model_1.default.findOne({
            customerId,
            status: order_constants_1.ORDER_STATUS.COMPLETED,
            customerReviewed: false,
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static updateRequestedPrice(orderId, requestedPrice, session) {
        return Order_model_1.default.findOneAndUpdate({
            _id: orderId,
            status: order_constants_1.ORDER_STATUS.PENDING,
        }, {
            $set: { requestedPrice },
        }, { new: true, session });
    }
    static markCancelled(input, session) {
        const filter = {
            _id: input.orderId,
            status: { $in: [order_constants_1.ORDER_STATUS.PENDING, order_constants_1.ORDER_STATUS.IN_PROGRESS] },
        };
        if (input.customerId) {
            filter.customerId = input.customerId;
        }
        return Order_model_1.default.findOneAndUpdate(filter, {
            $set: {
                status: order_constants_1.ORDER_STATUS.CANCELLED,
                cancelledBy: input.cancelledBy,
                cancellationReason: input.cancellationReason || null,
                cancelledAt: new Date(),
            },
        }, { new: true, session });
    }
    static markInProgress(orderId, supplierId, finalPrice, session) {
        return Order_model_1.default.findOneAndUpdate({
            _id: orderId,
            status: order_constants_1.ORDER_STATUS.PENDING,
        }, {
            $set: {
                status: order_constants_1.ORDER_STATUS.IN_PROGRESS,
                supplierId,
                finalPrice,
            },
        }, { new: true, session });
    }
    static markCompleted(orderId, session) {
        return Order_model_1.default.findOneAndUpdate({
            _id: orderId,
            status: order_constants_1.ORDER_STATUS.IN_PROGRESS,
        }, {
            $set: {
                status: order_constants_1.ORDER_STATUS.COMPLETED,
                completedAt: new Date(),
            },
        }, { new: true, session });
    }
    static findCustomerOrders(customerId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        return Order_model_1.default.find({ customerId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
    }
    static countCustomerOrders(customerId) {
        return Order_model_1.default.countDocuments({ customerId });
    }
    static resetToPending(orderId, session) {
        return Order_model_1.default.findOneAndUpdate({
            _id: orderId,
            status: order_constants_1.ORDER_STATUS.IN_PROGRESS,
        }, {
            $set: {
                status: order_constants_1.ORDER_STATUS.PENDING,
                supplierId: null,
                finalPrice: null,
            },
        }, { new: true, session });
    }
    static findPendingOrdersForSupplierFeed(input) {
        const query = {
            categoryId: input.categoryId,
            governmentId: { $in: input.governmentIds },
            status: order_constants_1.ORDER_STATUS.PENDING,
        };
        if (input.excludeCustomerId) {
            query.customerId = { $ne: input.excludeCustomerId };
        }
        return Order_model_1.default.find(query).sort({ createdAt: -1 });
    }
}
exports.OrderRepository = OrderRepository;

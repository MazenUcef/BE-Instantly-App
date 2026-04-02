"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderRepository = void 0;
const order_constants_1 = require("../../../shared/constants/order.constants");
const order_model_1 = __importDefault(require("../models/order.model"));
class OrderRepository {
    static createOrder(data, session) {
        return order_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(orderId, session) {
        return order_model_1.default.findById(orderId).session(session || null);
    }
    static findCustomerActiveOrder(customerId, session) {
        return order_model_1.default.findOne({
            customerId,
            status: { $in: [order_constants_1.ORDER_STATUS.PENDING, order_constants_1.ORDER_STATUS.IN_PROGRESS] },
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static findCustomerPendingReviewOrder(customerId, session) {
        return order_model_1.default.findOne({
            customerId,
            status: order_constants_1.ORDER_STATUS.COMPLETED,
            customerReviewed: false,
        })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static updateRequestedPrice(orderId, requestedPrice, session) {
        return order_model_1.default.findOneAndUpdate({
            _id: orderId,
            status: order_constants_1.ORDER_STATUS.PENDING,
        }, {
            $set: { requestedPrice },
        }, { new: true, session });
    }
    static deletePendingOrderByCustomer(orderId, customerId, session) {
        return order_model_1.default.findOneAndDelete({
            _id: orderId,
            customerId,
            status: order_constants_1.ORDER_STATUS.PENDING,
        }, { session });
    }
    static findCustomerOrders(customerId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        return order_model_1.default.find({ customerId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
    }
    static countCustomerOrders(customerId) {
        return order_model_1.default.countDocuments({ customerId });
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
        return order_model_1.default.find(query).sort({ createdAt: -1 });
    }
}
exports.OrderRepository = OrderRepository;

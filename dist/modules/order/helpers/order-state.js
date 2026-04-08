"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCustomerCancelOrder = exports.canCustomerUpdateOrderPrice = exports.assertValidOrderTransition = void 0;
const order_constants_1 = require("../../../shared/constants/order.constants");
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const assertValidOrderTransition = (currentStatus, nextStatus) => {
    const allowed = order_constants_1.ORDER_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
        throw new errorHandler_1.AppError(`Invalid order status transition from "${currentStatus}" to "${nextStatus}"`, 400);
    }
};
exports.assertValidOrderTransition = assertValidOrderTransition;
const canCustomerUpdateOrderPrice = (status) => {
    return status === order_constants_1.ORDER_STATUS.PENDING;
};
exports.canCustomerUpdateOrderPrice = canCustomerUpdateOrderPrice;
const canCustomerCancelOrder = (status) => {
    return [order_constants_1.ORDER_STATUS.PENDING, order_constants_1.ORDER_STATUS.IN_PROGRESS].includes(status);
};
exports.canCustomerCancelOrder = canCustomerCancelOrder;

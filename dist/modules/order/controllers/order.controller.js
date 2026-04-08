"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPendingOrders = exports.getCustomerOrderHistory = exports.getOrderDetails = exports.getActiveOrdersByCategory = exports.cancelOrder = exports.updateOrderPrice = exports.createOrder = void 0;
const order_service_1 = require("../services/order.service");
const createOrder = async (req, res) => {
    const result = await order_service_1.OrderService.createOrder({
        customerId: req.user.userId,
        customerName: req.user.name,
        address: req.body.address,
        description: req.body.description,
        categoryId: req.body.categoryId,
        governmentId: req.body.governmentId,
        requestedPrice: Number(req.body.requestedPrice),
        timeToStart: req.body.timeToStart,
        jobTitle: req.body.jobTitle,
        orderType: req.body.orderType,
    });
    return res.status(201).json(result);
};
exports.createOrder = createOrder;
const updateOrderPrice = async (req, res) => {
    const result = await order_service_1.OrderService.updateOrderPrice({
        orderId: req.params.id,
        customerId: req.user.userId,
        requestedPrice: Number(req.body.requestedPrice),
    });
    return res.status(200).json(result);
};
exports.updateOrderPrice = updateOrderPrice;
const cancelOrder = async (req, res) => {
    const result = await order_service_1.OrderService.cancelOrder({
        orderId: req.params.id,
        customerId: req.user.userId,
        cancellationReason: req.body.reason,
    });
    return res.status(200).json(result);
};
exports.cancelOrder = cancelOrder;
const getActiveOrdersByCategory = async (req, res) => {
    const result = await order_service_1.OrderService.getActiveOrdersByCategory({
        supplierId: req.user.userId,
        supplierCategoryId: req.user.categoryId,
        supplierGovernmentIds: req.user.governmentIds || [],
    });
    return res.status(200).json(result);
};
exports.getActiveOrdersByCategory = getActiveOrdersByCategory;
const getOrderDetails = async (req, res) => {
    const result = await order_service_1.OrderService.getOrderDetails({
        orderId: req.params.id,
        userId: req.user.userId,
        role: req.user.role,
        categoryId: req.user.categoryId,
        governmentIds: req.user.governmentIds || [],
    });
    return res.status(200).json(result);
};
exports.getOrderDetails = getOrderDetails;
const getCustomerOrderHistory = async (req, res) => {
    const result = await order_service_1.OrderService.getCustomerOrderHistory({
        customerId: req.user.userId,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
    });
    return res.status(200).json(result);
};
exports.getCustomerOrderHistory = getCustomerOrderHistory;
const checkPendingOrders = async (req, res) => {
    const result = await order_service_1.OrderService.checkPendingOrders({
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.checkPendingOrders = checkPendingOrders;

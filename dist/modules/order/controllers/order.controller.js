"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPendingOrders = exports.getCustomerOrderHistory = exports.getOrderDetails = exports.getActiveOrdersByCategory = exports.deleteOrder = exports.updateOrderPrice = exports.createOrder = void 0;
const Order_model_1 = __importDefault(require("../models/Order.model"));
const socket_1 = require("../../../shared/config/socket");
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const notification_publisher_1 = require("../../notification/notification.publisher");
const Offer_model_1 = __importDefault(require("../../offer/models/Offer.model"));
const Government_model_1 = __importDefault(require("../../government/models/Government.model"));
const Category_model_1 = __importDefault(require("../../category/models/Category.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const createOrder = async (req, res) => {
    try {
        const { address, description, categoryId, governmentId, requestedPrice, timeToStart, jobTitle, } = req.body;
        const { userId, name } = req.user;
        if (!requestedPrice || requestedPrice <= 0) {
            return res.status(400).json({ message: "Price is required" });
        }
        if (!governmentId) {
            return res.status(400).json({ message: "Government is required" });
        }
        if (!jobTitle) {
            return res.status(400).json({ message: "Job title is required" });
        }
        const government = await Government_model_1.default.findById(governmentId);
        if (!government) {
            return res.status(400).json({ message: "Invalid government" });
        }
        const category = await Category_model_1.default.findById(categoryId);
        if (!category) {
            return res.status(400).json({ message: "Invalid category" });
        }
        if (!category.jobs || !category.jobs.includes(jobTitle)) {
            return res.status(400).json({
                message: "Invalid job title for this category",
                availableJobTitles: category.jobs,
            });
        }
        const existingOrder = await Order_model_1.default.findOne({
            customerId: userId,
            status: { $in: ["pending", "in_progress"] },
        });
        if (existingOrder) {
            return res.status(400).json({
                message: "You already have an active order. Please complete it before creating a new one.",
            });
        }
        const unfinishedReview = await Order_model_1.default.findOne({
            customerId: userId,
            status: "completed",
            customerReviewed: false,
        }).sort({ createdAt: -1 });
        if (unfinishedReview) {
            try {
                const session = await session_model_1.default.findOne({
                    orderId: unfinishedReview._id,
                });
                let supplierData = null;
                if (session) {
                    supplierData = await User_model_1.default.findById(session.supplierId).select("-password");
                }
                return res.status(403).json({
                    message: "You have to review and rate your last order",
                    reviewRequired: true,
                    order: {
                        ...unfinishedReview.toObject(),
                        supplier: supplierData,
                    },
                });
            }
            catch (error) {
                console.log("error", error);
                return res.status(403).json({
                    reviewRequired: true,
                    order: unfinishedReview,
                });
            }
        }
        const order = await Order_model_1.default.create({
            customerId: userId,
            customerName: name,
            address,
            description,
            categoryId: new mongoose_1.default.Types.ObjectId(categoryId),
            governmentId: new mongoose_1.default.Types.ObjectId(governmentId),
            jobTitle,
            requestedPrice,
            timeToStart,
            status: "pending",
        });
        const populatedOrder = await Order_model_1.default.findById(order._id)
            .populate({
            path: "governmentId",
            select: "name nameAr country isActive",
            model: Government_model_1.default,
        })
            .populate({
            path: "categoryId",
            select: "name",
            model: Category_model_1.default,
        })
            .lean();
        const io = (0, socket_1.getIO)();
        io.to(`category_${categoryId}_government_${governmentId}`).emit("new_order", populatedOrder);
        const responseData = {
            ...populatedOrder,
            selectedJobTitle: jobTitle,
        };
        res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: responseData,
        });
    }
    catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ message: "Failed to create order" });
    }
};
exports.createOrder = createOrder;
const updateOrderPrice = async (req, res) => {
    try {
        const { id } = req.params;
        const { requestedPrice } = req.body;
        const order = await Order_model_1.default.findById(id);
        if (!order)
            return res.status(404).json({ message: "Order not found" });
        if (order.customerId !== req.user.userId)
            return res.status(403).json({ message: "Not allowed" });
        if (order.status !== "pending")
            return res.status(400).json({ message: "Cannot update price now" });
        order.requestedPrice = requestedPrice;
        await order.save();
        const io = (0, socket_1.getIO)();
        io.to(`category_${order.categoryId}`).emit("order_price_updated", order);
        res.json({ message: "Price updated", order });
    }
    catch (error) {
        console.error("Update order price error:", error);
        res.status(500).json({ message: "Failed to update price" });
    }
};
exports.updateOrderPrice = updateOrderPrice;
const deleteOrder = async (req, res) => {
    try {
        const order = await Order_model_1.default.findById(req.params.id);
        if (!order)
            return res.status(404).json({ message: "Order not found" });
        if (order.customerId !== req.user.userId)
            return res.status(403).json({ message: "Not allowed" });
        const pendingOffers = await Offer_model_1.default.find({
            orderId: order._id,
            status: "pending",
        });
        const io = (0, socket_1.getIO)();
        for (const offer of pendingOffers) {
            io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
                orderId: order._id,
                reason: "Order deleted by customer",
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: offer.supplierId.toString(),
                type: "OFFER_REJECTED",
                title: "Offer Rejected",
                message: `Your offer for order #${order._id} has been rejected because the order was deleted.`,
                data: {
                    offerId: offer._id.toString(),
                    orderId: order._id.toString(),
                },
            });
        }
        await Offer_model_1.default.updateMany({ orderId: order._id, status: "pending" }, { status: "rejected" });
        await order.deleteOne();
        res.json({ message: "Order deleted and offers rejected" });
    }
    catch (error) {
        console.error("Delete order error:", error);
        res.status(500).json({ message: "Failed to delete order" });
    }
};
exports.deleteOrder = deleteOrder;
const getActiveOrdersByCategory = async (req, res) => {
    try {
        const supplierCategoryId = req.user.categoryId;
        const supplierGovernmentIds = req.user.governmentIds || [];
        const userId = req.user.userId;
        console.log("Supplier Info:", {
            categoryId: supplierCategoryId,
            governmentIds: supplierGovernmentIds,
            userId,
        });
        if (!supplierGovernmentIds || supplierGovernmentIds.length === 0) {
            return res.json({
                type: "available_orders",
                count: 0,
                orders: [],
                message: "No active orders for now",
            });
        }
        const activeOffer = await Offer_model_1.default.findOne({
            supplierId: userId,
            status: { $in: ["pending", "accepted"] },
        }).sort({ createdAt: -1 });
        if (activeOffer) {
            const activeOrder = await Order_model_1.default.findById(activeOffer.orderId)
                .populate("governmentId", "name nameAr country")
                .populate("categoryId", "name");
            if (!activeOrder) {
                return res.status(404).json({
                    message: "Active order not found",
                });
            }
            return res.json({
                type: "active_job",
                order: activeOrder,
            });
        }
        const orders = await Order_model_1.default.find({
            categoryId: supplierCategoryId,
            governmentId: { $in: supplierGovernmentIds },
            status: "pending",
            customerId: { $ne: userId },
        })
            .populate({
            path: "governmentId",
            select: "name nameAr country isActive",
            model: Government_model_1.default,
        })
            .populate({
            path: "categoryId",
            select: "name description icon jobs",
            model: Category_model_1.default,
        })
            .sort({ createdAt: -1 });
        console.log(`Found ${orders.length} orders matching category and government`);
        const enrichedOrders = await Promise.all(orders.map(async (order) => {
            try {
                const customer = await User_model_1.default.findById(order.customerId).select("-password -refreshToken -biometrics");
                const orderObj = order.toObject();
                const { categoryId, ...rest } = orderObj;
                const populatedCategory = orderObj.categoryId;
                const { jobs, ...categoryWithoutJobs } = populatedCategory || { jobs: [] };
                return {
                    ...rest,
                    customer: customer || null,
                    government: orderObj.governmentId,
                    category: categoryWithoutJobs,
                };
            }
            catch (err) {
                console.error("Failed to fetch customer data:", err);
                return order;
            }
        }));
        return res.json({
            type: "available_orders",
            count: orders.length,
            orders: enrichedOrders,
        });
    }
    catch (error) {
        console.log("Get active orders error:", error);
        res.status(500).json({ message: "Failed to fetch orders" });
    }
};
exports.getActiveOrdersByCategory = getActiveOrdersByCategory;
const getOrderDetails = async (req, res) => {
    try {
        const order = await Order_model_1.default.findById(req.params.id);
        if (!order)
            return res.status(404).json({ message: "Order not found" });
        if (req.user.role === "supplier") {
            if (order.categoryId !== req.user.categoryId ||
                order.customerId === req.user.userId) {
                return res.status(403).json({ message: "Not allowed" });
            }
        }
        if (req.user.role === "customer") {
            if (order.customerId !== req.user.userId) {
                return res.status(403).json({ message: "Not allowed" });
            }
        }
        res.json(order);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch order details" });
    }
};
exports.getOrderDetails = getOrderDetails;
const getCustomerOrderHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const orders = await Order_model_1.default.find({ customerId: userId }).sort({
            createdAt: -1,
        });
        res.json({
            count: orders.length,
            orders,
        });
    }
    catch (error) {
        console.log("Get customer order history error:", error);
        res.status(500).json({ message: "Failed to fetch order history" });
    }
};
exports.getCustomerOrderHistory = getCustomerOrderHistory;
const checkPendingOrders = async (req, res) => {
    try {
        const userId = req.user.userId;
        const activeOrder = await Order_model_1.default.findOne({
            customerId: userId,
            status: { $in: ["pending", "in_progress"] },
        }).sort({ createdAt: -1 });
        if (activeOrder) {
            return res.json({
                hasPendingOrders: true,
                pendingOrder: activeOrder,
                status: activeOrder.status,
                message: "You have an active order",
            });
        }
        const pendingReviewOrder = await Order_model_1.default.findOne({
            customerId: userId,
            status: "completed",
            customerReviewed: false,
        }).sort({ createdAt: -1 });
        if (pendingReviewOrder) {
            const session = await session_model_1.default.findOne({
                orderId: pendingReviewOrder._id,
            });
            let supplierData = null;
            if (session) {
                supplierData = await User_model_1.default.findById(session.supplierId).select("-password -refreshToken -biometrics");
            }
            return res.json({
                hasPendingOrders: true,
                reviewRequired: true,
                pendingOrder: pendingReviewOrder,
                supplier: supplierData,
                message: "You have a completed order that needs review",
            });
        }
        const anyPendingOrder = await Order_model_1.default.findOne({
            customerId: userId,
            status: "pending",
        }).sort({ createdAt: -1 });
        if (anyPendingOrder) {
            return res.json({
                hasPendingOrders: true,
                pendingOrder: anyPendingOrder,
                status: "pending",
                message: "You have a pending order",
            });
        }
        return res.json({
            hasPendingOrders: false,
            message: "No pending orders found",
        });
    }
    catch (error) {
        console.error("Check pending orders error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to check pending orders"
        });
    }
};
exports.checkPendingOrders = checkPendingOrders;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOffer = exports.getAcceptedOfferHistory = exports.acceptOrderDirect = exports.getOffersByOrder = exports.rejectOffer = exports.acceptOffer = exports.createOffer = void 0;
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const socket_1 = require("../../../shared/config/socket");
const notification_publisher_1 = require("../../notification/notification.publisher");
const Order_model_1 = __importDefault(require("../../order/models/Order.model"));
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const Offer_model_1 = __importDefault(require("../models/Offer.model"));
const mongoose_1 = __importDefault(require("mongoose"));
const createOffer = async (req, res) => {
    try {
        const { orderId, type, amount, timeRange, customerId, timeToStart } = req.body;
        const token = req.headers.authorization;
        const supplierId = req.user.userId;
        const orderWithPendingReview = await Order_model_1.default.findOne({
            supplierId,
            status: "completed",
            supplierReviewed: false,
        }).sort({ updatedAt: -1 });
        if (orderWithPendingReview) {
            const session = await session_model_1.default.findOne({
                orderId: orderWithPendingReview._id,
            });
            let supplierData = null;
            if (session) {
                supplierData = await User_model_1.default.findById(session.supplierId).select("-password");
            }
            return res.status(403).json({
                reviewRequired: true,
                order: {
                    ...orderWithPendingReview.toObject(),
                    supplier: supplierData,
                },
                message: "You must review your last completed job before creating a new offer.",
            });
        }
        const activeJob = await Offer_model_1.default.findOne({
            supplierId,
            status: { $in: ["pending", "accepted"] },
            orderId: { $ne: orderId },
        });
        if (activeJob) {
            return res.status(400).json({
                message: "You already have an active offer or job",
            });
        }
        const existingOffer = await Offer_model_1.default.findOne({
            supplierId,
            orderId,
            status: { $in: ["pending", "rejected", "expired"] },
        });
        const expiresAt = type === "price" ? new Date(Date.now() + 3 * 60 * 1000) : null;
        if (existingOffer) {
            existingOffer.type = type;
            existingOffer.amount = amount;
            existingOffer.timeRange = timeRange;
            existingOffer.timeToStart = timeToStart;
            existingOffer.status = "pending";
            existingOffer.expiresAt = expiresAt;
            await existingOffer.save();
            const io = (0, socket_1.getIO)();
            io.to(`user_${customerId}`).emit("offer_updated", existingOffer);
            await (0, notification_publisher_1.publishNotification)({
                userId: customerId,
                type: "NEW_OFFER",
                title: "New Offer Received",
                message: `You have received a new offer for your order #${orderId}.`,
                data: {
                    offerId: existingOffer._id.toString(),
                    orderId,
                    supplierId,
                    type,
                    amount,
                    timeRange,
                    timeToStart,
                },
            });
            return res.status(200).json({
                message: "Offer updated and resent",
                offer: existingOffer,
            });
        }
        const offer = await Offer_model_1.default.create({
            orderId,
            type,
            amount,
            timeRange,
            supplierId,
            expiresAt,
            timeToStart,
            status: "pending",
        });
        const io = (0, socket_1.getIO)();
        io.to(`user_${customerId}`).emit("new_offer", offer);
        await (0, notification_publisher_1.publishNotification)({
            userId: customerId,
            type: "NEW_OFFER",
            title: "New Offer Received",
            message: `You have received a new offer for your order #${orderId}.`,
            data: {
                offerId: offer._id.toString(),
                orderId,
                supplierId,
                type,
                amount,
                timeRange,
                timeToStart,
            },
        });
        res.status(201).json({
            message: "Offer created",
            offer,
        });
    }
    catch (error) {
        console.error("Create offer error:", error);
        res.status(500).json({ message: "Failed to create offer" });
    }
};
exports.createOffer = createOffer;
const acceptOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await Offer_model_1.default.findOneAndUpdate({ _id: id, status: "pending" }, { status: "accepted" }, { new: true });
        if (!offer) {
            return res.status(404).json({
                message: "Offer not found or already processed",
            });
        }
        await Order_model_1.default.findByIdAndUpdate(offer.orderId, {
            status: "in_progress",
        });
        await Offer_model_1.default.updateMany({ orderId: offer.orderId, _id: { $ne: offer._id } }, { status: "rejected" });
        let session = null;
        const order = await Order_model_1.default.findById(offer.orderId);
        if (order) {
            session = await session_model_1.default.create({
                orderId: offer.orderId,
                offerId: offer._id,
                customerId: order.customerId,
                supplierId: offer.supplierId,
                status: "started",
            });
            console.log("✅ Session created:", {
                sessionId: session._id,
                orderId: offer.orderId,
                offerId: offer._id,
                customerId: order.customerId,
                supplierId: offer.supplierId
            });
        }
        const io = (0, socket_1.getIO)();
        io.to(`user_${offer.supplierId}`).emit("offer_accepted", {
            ...offer.toObject(),
            sessionId: session?._id
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: offer.supplierId.toString(),
            type: "OFFER_ACCEPTED",
            title: "Offer Accepted",
            message: `Your offer for order #${offer.orderId} has been accepted.`,
            data: {
                offerId: offer._id.toString(),
                orderId: offer.orderId.toString(),
                customerId: order?.customerId.toString(),
                sessionId: session?._id.toString(),
            },
        });
        res.json({
            message: "Offer accepted and session created",
            offer,
            session: session ? {
                _id: session._id,
                orderId: session.orderId,
                offerId: session.offerId,
                customerId: session.customerId,
                supplierId: session.supplierId,
                status: session.status
            } : null,
        });
    }
    catch (error) {
        console.error("Accept offer error:", error);
        res.status(500).json({ message: "Failed to accept offer" });
    }
};
exports.acceptOffer = acceptOffer;
const rejectOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const offer = await Offer_model_1.default.findOneAndUpdate({ _id: id, status: "pending" }, { status: "rejected" }, { new: true });
        if (!offer) {
            return res.status(404).json({ message: "Offer not found" });
        }
        const io = (0, socket_1.getIO)();
        io.to(`user_${offer.supplierId}`).emit("offer_rejected", {
            orderId: offer.orderId,
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: offer.supplierId.toString(),
            type: "OFFER_REJECTED",
            title: "Offer Rejected",
            message: `Your offer for order #${offer.orderId} has been rejected`,
            data: {
                offerId: offer._id.toString(),
                orderId: offer.orderId.toString(),
            },
        });
        res.json({ message: "Offer rejected", offer });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to reject offer" });
    }
};
exports.rejectOffer = rejectOffer;
const getOffersByOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        await Offer_model_1.default.updateMany({
            orderId,
            status: "pending",
            expiresAt: { $lte: new Date() },
        }, { status: "expired" });
        const offers = await Offer_model_1.default.find({
            orderId,
            status: "pending",
        }).sort({ createdAt: -1 });
        res.json({ offers });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch offers" });
    }
};
exports.getOffersByOrder = getOffersByOrder;
const acceptOrderDirect = async (req, res) => {
    try {
        const { orderId } = req.params;
        const supplierId = req.user.userId;
        const existingActive = await Offer_model_1.default.findOne({
            supplierId,
            status: { $in: ["pending", "accepted"] },
        });
        if (existingActive) {
            return res.status(400).json({
                message: "You already have an active job or offer",
            });
        }
        const order = await Order_model_1.default.findById(orderId);
        if (!order || order.status !== "pending") {
            return res
                .status(400)
                .json({ message: "Order already taken or not found" });
        }
        order.status = "in_progress";
        await order.save();
        const offer = await Offer_model_1.default.create({
            orderId,
            supplierId,
            type: "price",
            amount: order.requestedPrice,
            status: "accepted",
        });
        await Offer_model_1.default.updateMany({ orderId, _id: { $ne: offer._id } }, { status: "rejected" });
        const session = await session_model_1.default.create({
            orderId,
            offerId: offer._id,
            customerId: order.customerId,
            supplierId,
            status: "started",
        });
        console.log("✅ Session created via direct started:", {
            sessionId: session._id,
            orderId,
            offerId: offer._id,
            customerId: order.customerId,
            supplierId
        });
        const io = (0, socket_1.getIO)();
        io.to(`user_${order.customerId}`).emit("order_accepted_direct", {
            orderId,
            supplierId,
            sessionId: session._id,
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: order.customerId.toString(),
            type: "ORDER_ACCEPTED_DIRECT",
            title: "Order Accepted",
            message: `Your order #${orderId} has been accepted directly by a supplier.`,
            data: {
                orderId,
                supplierId: supplierId.toString(),
                offerId: offer._id.toString(),
                sessionId: session._id.toString(),
            },
        });
        res.json({
            message: "Order accepted successfully",
            offer: {
                ...offer.toObject(),
                sessionId: session._id,
            },
            session: {
                _id: session._id,
                orderId: session.orderId,
                offerId: session.offerId,
                customerId: session.customerId,
                supplierId: session.supplierId,
                status: session.status
            },
            order: {
                _id: order._id,
                status: order.status,
                customerId: order.customerId,
            },
        });
    }
    catch (error) {
        console.error("Direct accept error:", error);
        res.status(500).json({ message: "Failed to accept order" });
    }
};
exports.acceptOrderDirect = acceptOrderDirect;
const getAcceptedOfferHistory = async (req, res) => {
    try {
        const supplierId = req.user.userId;
        const { page = 1, limit = 10, status } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const filter = {
            supplierId,
            status: "accepted",
        };
        if (status) {
            filter.orderStatus = status;
        }
        const total = await Offer_model_1.default.countDocuments(filter);
        const offers = await Offer_model_1.default.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);
        const enrichedOffers = await Promise.all(offers.map(async (offer) => {
            try {
                const order = await Order_model_1.default.findById(offer.orderId);
                const session = await session_model_1.default.findOne({ offerId: offer._id });
                let customer = null;
                if (order) {
                    customer = await User_model_1.default.findById(order.customerId).select("-password -refreshToken -biometrics");
                }
                return {
                    ...offer.toObject(),
                    order: order || null,
                    session: session || null,
                    customer: customer || null,
                };
            }
            catch (err) {
                console.error("Failed to fetch offer details:", err);
                return offer;
            }
        }));
        const stats = {
            totalEarnings: await calculateTotalEarnings(supplierId),
            completedJobs: await Offer_model_1.default.countDocuments({
                supplierId,
                status: "accepted",
                orderStatus: "completed",
            }),
            inProgressJobs: await Offer_model_1.default.countDocuments({
                supplierId,
                status: "accepted",
                orderStatus: "in_progress",
            }),
        };
        res.json({
            success: true,
            data: {
                offers: enrichedOffers,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                },
                stats,
            },
        });
    }
    catch (error) {
        console.error("Get accepted offer history error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch offer history"
        });
    }
};
exports.getAcceptedOfferHistory = getAcceptedOfferHistory;
const calculateTotalEarnings = async (supplierId) => {
    try {
        const completedOffers = await Offer_model_1.default.aggregate([
            {
                $match: {
                    supplierId: new mongoose_1.default.Types.ObjectId(supplierId),
                    status: "accepted",
                },
            },
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "_id",
                    as: "order",
                },
            },
            {
                $unwind: "$order",
            },
            {
                $match: {
                    "order.status": "completed",
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" },
                },
            },
        ]);
        return completedOffers.length > 0 ? completedOffers[0].total : 0;
    }
    catch (error) {
        console.error("Calculate total earnings error:", error);
        return 0;
    }
};
const deleteOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const supplierId = req.user.userId;
        const offer = await Offer_model_1.default.findById(id);
        if (!offer) {
            return res.status(404).json({
                success: false,
                message: "Offer not found"
            });
        }
        if (offer.supplierId.toString() !== supplierId) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this offer"
            });
        }
        const order = await Order_model_1.default.findById(offer.orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Associated order not found"
            });
        }
        if (order.status !== "pending" && order.status !== "in_progress") {
            return res.status(400).json({
                success: false,
                message: `Cannot delete offer when order is ${order.status}`
            });
        }
        const session = await session_model_1.default.findOne({ offerId: offer._id });
        if (session && session.status !== "cancelled") {
            return res.status(400).json({
                success: false,
                message: "Cannot delete offer with active session. Please cancel the session first."
            });
        }
        const offerDetails = {
            id: offer._id.toString(),
            orderId: offer.orderId.toString(),
            amount: offer.amount,
            status: offer.status,
        };
        await offer.deleteOne();
        if (offerDetails.status === "pending") {
            const io = (0, socket_1.getIO)();
            io.to(`user_${order.customerId}`).emit("offer_deleted", {
                offerId: offerDetails.id,
                orderId: offerDetails.orderId,
                message: "A supplier has withdrawn their offer",
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: order.customerId.toString(),
                type: "OFFER_DELETED",
                title: "Offer Withdrawn",
                message: `A supplier has withdrawn their offer of $${offerDetails.amount} for your order #${offerDetails.orderId}.`,
                data: {
                    offerId: offerDetails.id,
                    orderId: offerDetails.orderId,
                },
            });
        }
        if (offerDetails.status === "accepted") {
            await Order_model_1.default.findByIdAndUpdate(offer.orderId, {
                status: "pending",
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: order.customerId.toString(),
                type: "ORDER_NEEDS_SUPPLIER",
                title: "Order Needs New Supplier",
                message: `The supplier for order #${offerDetails.orderId} has withdrawn. Your order is now available for new offers.`,
                data: {
                    orderId: offerDetails.orderId,
                },
            });
            const io = (0, socket_1.getIO)();
            io.to(`category_${order.categoryId}_government_${order.governmentId}`).emit("order_available_again", {
                orderId: offerDetails.orderId,
                message: "A previously accepted order is now available for new offers",
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: supplierId,
                type: "OFFER_WITHDRAWN",
                title: "Offer Withdrawn",
                message: `You have successfully withdrawn your accepted offer for order #${offerDetails.orderId}.`,
                data: {
                    offerId: offerDetails.id,
                    orderId: offerDetails.orderId,
                },
            });
        }
        res.json({
            success: true,
            message: offerDetails.status === "accepted"
                ? "Accepted offer withdrawn successfully. Order is now available for new offers."
                : "Offer deleted successfully",
            data: {
                deletedOfferId: offerDetails.id,
                orderId: offerDetails.orderId,
                orderStatus: order.status === "in_progress" ? "in_progress" : "pending",
            },
        });
    }
    catch (error) {
        console.error("Delete offer error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete offer"
        });
    }
};
exports.deleteOffer = deleteOffer;

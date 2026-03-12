"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReview = void 0;
const review_model_1 = __importDefault(require("../models/review.model"));
const notification_publisher_1 = require("../../notification/notification.publisher");
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const Order_model_1 = __importDefault(require("../../order/models/Order.model"));
const createReview = async (req, res) => {
    try {
        const { reviewerId, targetUserId, rating, comment, orderId, role } = req.body;
        if (reviewerId === targetUserId) {
            return res.status(400).json({ message: "You cannot review yourself" });
        }
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Rating must be between 1 and 5" });
        }
        const existingReview = await review_model_1.default.findOne({
            reviewerId,
            orderId,
        });
        if (existingReview) {
            return res.status(400).json({
                message: "You have already reviewed this order"
            });
        }
        const review = await review_model_1.default.create({
            reviewerId,
            targetUserId,
            rating,
            comment,
        });
        await Order_model_1.default.findByIdAndUpdate(orderId, {
            [`${role}Reviewed`]: true,
        });
        const reviews = await review_model_1.default.find({ targetUserId });
        const totalReviews = reviews.length;
        const averageRating = reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews;
        const targetUser = await User_model_1.default.findById(targetUserId);
        if (targetUser) {
            targetUser.averageRating = averageRating;
            targetUser.totalReviews = totalReviews;
            const reviewer = await User_model_1.default.findById(reviewerId);
            targetUser.reviews?.push({
                reviewerId: reviewerId,
                reviewerName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Unknown",
                rating,
                comment,
                createdAt: new Date(),
            });
            await targetUser.save();
        }
        const order = await Order_model_1.default.findById(orderId);
        const session = await session_model_1.default.findOne({ orderId });
        const reviewer = await User_model_1.default.findById(reviewerId);
        const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Someone";
        await (0, notification_publisher_1.publishNotification)({
            userId: targetUserId,
            type: "NEW_REVIEW",
            title: "New Review Received",
            message: `${reviewerName} left you a ${rating}-star review: "${comment}"`,
            data: {
                reviewId: review._id.toString(),
                reviewerId,
                orderId,
                rating,
                comment,
            },
        });
        if (order && session) {
            const customerReviewed = role === "customer" ? true : order.customerReviewed;
            const supplierReviewed = role === "supplier" ? true : order.supplierReviewed;
            if (customerReviewed && supplierReviewed) {
                await (0, notification_publisher_1.publishNotification)({
                    userId: order.customerId.toString(),
                    type: "REVIEWS_COMPLETE",
                    title: "All Reviews Submitted",
                    message: `Both you and the supplier have reviewed order #${orderId}.`,
                    data: {
                        orderId: orderId.toString(),
                    },
                });
                await (0, notification_publisher_1.publishNotification)({
                    userId: session.supplierId.toString(),
                    type: "REVIEWS_COMPLETE",
                    title: "All Reviews Submitted",
                    message: `Both you and the customer have reviewed order #${orderId}.`,
                    data: {
                        orderId: orderId.toString(),
                    },
                });
            }
        }
        res.status(201).json({
            message: "Review created successfully",
            review: {
                ...review.toObject(),
                targetUserRating: {
                    averageRating,
                    totalReviews,
                },
            },
        });
    }
    catch (error) {
        console.error("Create review error:", error);
        res.status(500).json({ message: "Failed to create review" });
    }
};
exports.createReview = createReview;

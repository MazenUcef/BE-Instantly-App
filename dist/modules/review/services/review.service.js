"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const review_repository_1 = require("../repositories/review.repository");
const order_model_1 = __importDefault(require("../../order/models/order.model"));
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const review_constants_1 = require("../../../shared/constants/review.constants");
const notification_publisher_1 = require("../../notification/notification.publisher");
class ReviewService {
    static async createReview(input) {
        const { actorUserId, orderId, rating, comment, role } = input;
        const dbSession = await mongoose_1.default.startSession();
        let createdReview = null;
        let targetUserId = "";
        let reviewerName = "Someone";
        let averageRating = 0;
        let totalReviews = 0;
        let customerId = null;
        let supplierId = null;
        let bothReviewed = false;
        try {
            await dbSession.withTransaction(async () => {
                if (![review_constants_1.REVIEW_ROLES.CUSTOMER, review_constants_1.REVIEW_ROLES.SUPPLIER].includes(role)) {
                    throw new errorHandler_1.AppError("Invalid review role", 400);
                }
                const order = await order_model_1.default.findById(orderId).session(dbSession);
                if (!order) {
                    throw new errorHandler_1.AppError("Order not found", 404);
                }
                const session = await session_model_1.default.findOne({ orderId }).session(dbSession);
                if (!session) {
                    throw new errorHandler_1.AppError("Session not found for this order", 404);
                }
                customerId = order.customerId.toString();
                supplierId = session.supplierId.toString();
                const isCustomerReviewer = role === review_constants_1.REVIEW_ROLES.CUSTOMER;
                const isSupplierReviewer = role === review_constants_1.REVIEW_ROLES.SUPPLIER;
                if (isCustomerReviewer && actorUserId !== customerId) {
                    throw new errorHandler_1.AppError("Only the customer can submit a customer review", 403);
                }
                if (isSupplierReviewer && actorUserId !== supplierId) {
                    throw new errorHandler_1.AppError("Only the supplier can submit a supplier review", 403);
                }
                if (order.status !== "completed") {
                    throw new errorHandler_1.AppError("Reviews can only be submitted after order completion", 400);
                }
                if (isCustomerReviewer && order.customerReviewed) {
                    throw new errorHandler_1.AppError("Customer has already reviewed this order", 400);
                }
                if (isSupplierReviewer && order.supplierReviewed) {
                    throw new errorHandler_1.AppError("Supplier has already reviewed this order", 400);
                }
                targetUserId = isCustomerReviewer ? supplierId : customerId;
                if (actorUserId === targetUserId) {
                    throw new errorHandler_1.AppError("You cannot review yourself", 400);
                }
                const existingReview = await review_repository_1.ReviewRepository.findByReviewerAndOrder(actorUserId, orderId, dbSession);
                if (existingReview) {
                    throw new errorHandler_1.AppError("You have already reviewed this order", 400);
                }
                createdReview = await review_repository_1.ReviewRepository.create({
                    reviewerId: actorUserId,
                    targetUserId,
                    orderId,
                    sessionId: session._id,
                    rating,
                    comment,
                }, dbSession);
                const reviewedField = role === review_constants_1.REVIEW_ROLES.CUSTOMER ? "customerReviewed" : "supplierReviewed";
                const updatedOrder = await order_model_1.default.findByIdAndUpdate(orderId, { $set: { [reviewedField]: true } }, { new: true, session: dbSession });
                const stats = await review_repository_1.ReviewRepository.aggregateTargetUserStats(targetUserId, dbSession);
                averageRating = stats[0]?.averageRating || 0;
                totalReviews = stats[0]?.totalReviews || 0;
                await User_model_1.default.findByIdAndUpdate(targetUserId, {
                    $set: {
                        averageRating,
                        totalReviews,
                    },
                }, { session: dbSession });
                const reviewer = await User_model_1.default.findById(actorUserId)
                    .select("firstName lastName")
                    .session(dbSession);
                reviewerName = reviewer
                    ? `${reviewer.firstName} ${reviewer.lastName}`
                    : "Someone";
                bothReviewed = Boolean(updatedOrder?.customerReviewed && updatedOrder?.supplierReviewed);
            });
        }
        finally {
            await dbSession.endSession();
        }
        await (0, notification_publisher_1.publishNotification)({
            userId: targetUserId,
            type: review_constants_1.REVIEW_NOTIFICATION_TYPES.NEW_REVIEW,
            title: "New Review Received",
            message: `${reviewerName} left you a ${rating}-star review.`,
            data: {
                reviewId: createdReview._id.toString(),
                reviewerId: actorUserId,
                orderId,
                rating,
                comment,
            },
        });
        if (bothReviewed && customerId && supplierId) {
            await (0, notification_publisher_1.publishNotification)({
                userId: customerId,
                type: review_constants_1.REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
                title: "All Reviews Submitted",
                message: "Both you and the supplier have submitted your reviews.",
                data: { orderId },
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: supplierId,
                type: review_constants_1.REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
                title: "All Reviews Submitted",
                message: "Both you and the customer have submitted your reviews.",
                data: { orderId },
            });
        }
        return {
            success: true,
            message: "Review created successfully",
            review: {
                ...createdReview.toObject(),
                targetUserRating: {
                    averageRating,
                    totalReviews,
                },
            },
        };
    }
    static async getReviewById(reviewId) {
        const review = await review_repository_1.ReviewRepository.findById(reviewId);
        if (!review) {
            throw new errorHandler_1.AppError("Review not found", 404);
        }
        return {
            success: true,
            review,
        };
    }
    static async getOrderReviews(orderId) {
        const reviews = await review_repository_1.ReviewRepository.findByOrderId(orderId);
        return {
            success: true,
            count: reviews.length,
            reviews,
        };
    }
    static async getUserReviews(userId, page = 1, limit = 10) {
        const [reviews, total] = await Promise.all([
            review_repository_1.ReviewRepository.findByTargetUserId(userId, page, limit),
            review_repository_1.ReviewRepository.countByTargetUserId(userId),
        ]);
        return {
            success: true,
            count: reviews.length,
            total,
            page,
            limit,
            reviews,
        };
    }
}
exports.ReviewService = ReviewService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewRepository = void 0;
const mongoose_1 = require("mongoose");
const review_model_1 = __importDefault(require("../models/review.model"));
class ReviewRepository {
    static create(data, session) {
        return review_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findByReviewerAndOrder(reviewerId, orderId, session) {
        return review_model_1.default.findOne({ reviewerId, orderId }).session(session || null);
    }
    static findById(reviewId) {
        return review_model_1.default.findById(reviewId)
            .populate("reviewerId", "firstName lastName profilePicture")
            .populate("targetUserId", "firstName lastName profilePicture averageRating totalReviews");
    }
    static findByOrderId(orderId) {
        return review_model_1.default.find({ orderId })
            .sort({ createdAt: -1 })
            .populate("reviewerId", "firstName lastName profilePicture")
            .populate("targetUserId", "firstName lastName profilePicture");
    }
    static findByTargetUserId(userId, page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        return review_model_1.default.find({ targetUserId: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("reviewerId", "firstName lastName profilePicture");
    }
    static countByTargetUserId(userId) {
        return review_model_1.default.countDocuments({ targetUserId: userId });
    }
    static aggregateTargetUserStats(targetUserId, session) {
        return review_model_1.default.aggregate([
            {
                $match: {
                    targetUserId: typeof targetUserId === "string"
                        ? new mongoose_1.Types.ObjectId(targetUserId)
                        : targetUserId,
                },
            },
            {
                $group: {
                    _id: "$targetUserId",
                    averageRating: { $avg: "$rating" },
                    totalReviews: { $sum: 1 },
                },
            },
        ]).session(session || null);
    }
}
exports.ReviewRepository = ReviewRepository;

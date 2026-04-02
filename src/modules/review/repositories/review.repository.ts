import { ClientSession, Types } from "mongoose";
import ReviewModel from "../models/review.model";

export class ReviewRepository {
  static create(
    data: {
      reviewerId: Types.ObjectId | string;
      targetUserId: Types.ObjectId | string;
      orderId: Types.ObjectId | string;
      sessionId?: Types.ObjectId | string | null;
      rating: number;
      comment: string;
    },
    session?: ClientSession,
  ) {
    return ReviewModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findByReviewerAndOrder(
    reviewerId: Types.ObjectId | string,
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return ReviewModel.findOne({ reviewerId, orderId }).session(session || null);
  }

  static findById(reviewId: Types.ObjectId | string) {
    return ReviewModel.findById(reviewId)
      .populate("reviewerId", "firstName lastName profilePicture")
      .populate("targetUserId", "firstName lastName profilePicture averageRating totalReviews");
  }

  static findByOrderId(orderId: Types.ObjectId | string) {
    return ReviewModel.find({ orderId })
      .sort({ createdAt: -1 })
      .populate("reviewerId", "firstName lastName profilePicture")
      .populate("targetUserId", "firstName lastName profilePicture");
  }

  static findByTargetUserId(
    userId: Types.ObjectId | string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;

    return ReviewModel.find({ targetUserId: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reviewerId", "firstName lastName profilePicture");
  }

  static countByTargetUserId(userId: Types.ObjectId | string) {
    return ReviewModel.countDocuments({ targetUserId: userId });
  }

  static aggregateTargetUserStats(
    targetUserId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return ReviewModel.aggregate([
      {
        $match: {
          targetUserId: typeof targetUserId === "string"
            ? new Types.ObjectId(targetUserId)
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
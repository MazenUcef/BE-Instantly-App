import mongoose from "mongoose";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { ReviewRepository } from "../repositories/review.repository";
import ReviewModel from "../models/review.model";
import OrderModel from "../../order/models/order.model";
import SessionModel from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import { REVIEW_NOTIFICATION_TYPES, REVIEW_ROLES } from "../../../shared/constants/review.constants";
import { publishNotification } from "../../notification/notification.publisher";

export class ReviewService {
  static async createReview(input: {
    actorUserId: string;
    orderId: string;
    rating: number;
    comment: string;
    role: string;
  }) {
    const { actorUserId, orderId, rating, comment, role } = input;

    const dbSession = await mongoose.startSession();

    let createdReview: any = null;
    let targetUserId: string | null = null;
    let reviewerName = "Someone";
    let averageRating = 0;
    let totalReviews = 0;
    let customerId: string | null = null;
    let supplierId: string | null = null;
    let bothReviewed = false;

    try {
      await dbSession.withTransaction(async () => {
        if (![REVIEW_ROLES.CUSTOMER, REVIEW_ROLES.SUPPLIER].includes(role as any)) {
          throw new AppError("Invalid review role", 400);
        }

        const order = await OrderModel.findById(orderId).session(dbSession);
        if (!order) {
          throw new AppError("Order not found", 404);
        }

        const session = await SessionModel.findOne({ orderId }).session(dbSession);
        if (!session) {
          throw new AppError("Session not found for this order", 404);
        }

        customerId = order.customerId.toString();
        supplierId = session.supplierId.toString();

        const isCustomerReviewer = role === REVIEW_ROLES.CUSTOMER;
        const isSupplierReviewer = role === REVIEW_ROLES.SUPPLIER;

        if (isCustomerReviewer && actorUserId !== customerId) {
          throw new AppError("Only the customer can submit a customer review", 403);
        }

        if (isSupplierReviewer && actorUserId !== supplierId) {
          throw new AppError("Only the supplier can submit a supplier review", 403);
        }

        if (order.status !== "completed") {
          throw new AppError("Reviews can only be submitted after order completion", 400);
        }

        if (isCustomerReviewer && order.customerReviewed) {
          throw new AppError("Customer has already reviewed this order", 400);
        }

        if (isSupplierReviewer && order.supplierReviewed) {
          throw new AppError("Supplier has already reviewed this order", 400);
        }

        targetUserId = isCustomerReviewer ? supplierId : customerId;

        if (actorUserId === targetUserId) {
          throw new AppError("You cannot review yourself", 400);
        }

        const existingReview = await ReviewRepository.findByReviewerAndOrder(
          actorUserId,
          orderId,
          dbSession,
        );

        if (existingReview) {
          throw new AppError("You have already reviewed this order", 400);
        }

        createdReview = await ReviewRepository.create(
          {
            reviewerId: actorUserId,
            targetUserId,
            orderId,
            sessionId: session._id,
            rating,
            comment,
          },
          dbSession,
        );

        const reviewedField =
          role === REVIEW_ROLES.CUSTOMER ? "customerReviewed" : "supplierReviewed";

        const updatedOrder = await OrderModel.findByIdAndUpdate(
          orderId,
          { $set: { [reviewedField]: true } },
          { new: true, session: dbSession },
        );

        const stats = await ReviewRepository.aggregateTargetUserStats(
          targetUserId,
          dbSession,
        );

        averageRating = stats[0]?.averageRating || 0;
        totalReviews = stats[0]?.totalReviews || 0;

        await UserModel.findByIdAndUpdate(
          targetUserId,
          {
            $set: {
              averageRating,
              totalReviews,
            },
          },
          { session: dbSession },
        );

        const reviewer = await UserModel.findById(actorUserId)
          .select("firstName lastName")
          .session(dbSession);

        reviewerName = reviewer
          ? `${reviewer.firstName} ${reviewer.lastName}`
          : "Someone";

        bothReviewed = Boolean(
          updatedOrder?.customerReviewed && updatedOrder?.supplierReviewed,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    await publishNotification({
      userId: targetUserId!,
      type: REVIEW_NOTIFICATION_TYPES.NEW_REVIEW,
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
      await publishNotification({
        userId: customerId,
        type: REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
        title: "All Reviews Submitted",
        message: "Both you and the supplier have submitted your reviews.",
        data: { orderId },
      });

      await publishNotification({
        userId: supplierId,
        type: REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
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

  static async getReviewById(reviewId: string) {
    const review = await ReviewRepository.findById(reviewId);

    if (!review) {
      throw new AppError("Review not found", 404);
    }

    return {
      success: true,
      review,
    };
  }

  static async getOrderReviews(orderId: string) {
    const reviews = await ReviewRepository.findByOrderId(orderId);

    return {
      success: true,
      count: reviews.length,
      reviews,
    };
  }

  static async getUserReviews(userId: string, page = 1, limit = 10) {
    const [reviews, total] = await Promise.all([
      ReviewRepository.findByTargetUserId(userId, page, limit),
      ReviewRepository.countByTargetUserId(userId),
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
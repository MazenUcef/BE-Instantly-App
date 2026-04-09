import mongoose from "mongoose";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { ReviewRepository } from "../repositories/review.repository";
import ReviewModel from "../models/review.model";
import OrderModel from "../../order/models/Order.model";
import BundleBookingModel from "../../bundleBooking/models/bundleBooking.model";
import SessionModel from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import { REVIEW_NOTIFICATION_TYPES, REVIEW_ROLES } from "../../../shared/constants/review.constants";
import { publishNotification } from "../../notification/notification.publisher";

export class ReviewService {
  static async createReview(input: {
    actorUserId: string;
    orderId?: string;
    bundleBookingId?: string;
    rating: number;
    comment: string;
    role: string;
  }) {
    const { actorUserId, orderId, bundleBookingId, rating, comment, role } = input;

    if (!orderId && !bundleBookingId) {
      throw new AppError("Either orderId or bundleBookingId is required", 400);
    }

    const dbSession = await mongoose.startSession();

    let createdReview: any = null;
    let targetUserId: string = "";
    let reviewerName = "Someone";
    let averageRating = 0;
    let totalReviews = 0;
    let customerId: string | null = null;
    let supplierId: string | null = null;
    let bothReviewed = false;
    const referenceId = orderId || bundleBookingId!;

    try {
      await dbSession.withTransaction(async () => {
        if (![REVIEW_ROLES.CUSTOMER, REVIEW_ROLES.SUPPLIER].includes(role as any)) {
          throw new AppError("Invalid review role", 400);
        }

        let reviewSource: any = null;
        let session: any = null;

        if (orderId) {
          const order = await OrderModel.findById(orderId).session(dbSession);
          if (!order) throw new AppError("Order not found", 404);
          session = await SessionModel.findOne({ orderId }).session(dbSession);
          if (!session) throw new AppError("Session not found for this order", 404);
          if (order.status !== "completed") {
            throw new AppError("Reviews can only be submitted after completion", 400);
          }
          customerId = order.customerId.toString();
          supplierId = session.supplierId.toString();
          reviewSource = order;
        } else {
          const booking = await BundleBookingModel.findById(bundleBookingId).session(dbSession);
          if (!booking) throw new AppError("Booking not found", 404);
          session = await SessionModel.findOne({ bundleBookingId }).session(dbSession);
          if (!session) throw new AppError("Session not found for this booking", 404);
          if (booking.status !== "completed") {
            throw new AppError("Reviews can only be submitted after completion", 400);
          }
          customerId = booking.customerId.toString();
          supplierId = booking.supplierId.toString();
          reviewSource = booking;
        }

        const isCustomerReviewer = role === REVIEW_ROLES.CUSTOMER;
        const isSupplierReviewer = role === REVIEW_ROLES.SUPPLIER;

        if (isCustomerReviewer && actorUserId !== customerId) {
          throw new AppError("Only the customer can submit a customer review", 403);
        }

        if (isSupplierReviewer && actorUserId !== supplierId) {
          throw new AppError("Only the supplier can submit a supplier review", 403);
        }

        if (isCustomerReviewer && reviewSource.customerReviewed) {
          throw new AppError("Customer has already reviewed", 400);
        }

        if (isSupplierReviewer && reviewSource.supplierReviewed) {
          throw new AppError("Supplier has already reviewed", 400);
        }

        targetUserId = isCustomerReviewer ? supplierId! : customerId!;

        if (actorUserId === targetUserId) {
          throw new AppError("You cannot review yourself", 400);
        }

        const existingReview = await ReviewRepository.findByReviewerAndOrder(
          actorUserId,
          referenceId,
          dbSession,
        );

        if (existingReview) {
          throw new AppError("You have already submitted a review", 400);
        }

        createdReview = await ReviewRepository.create(
          {
            reviewerId: actorUserId,
            targetUserId,
            orderId: orderId || referenceId,
            sessionId: session._id,
            rating,
            comment,
          },
          dbSession,
        );

        const reviewedField =
          role === REVIEW_ROLES.CUSTOMER ? "customerReviewed" : "supplierReviewed";

        let updatedSource: any;
        if (orderId) {
          updatedSource = await OrderModel.findByIdAndUpdate(
            orderId,
            { $set: { [reviewedField]: true } },
            { new: true, session: dbSession },
          );
        } else {
          updatedSource = await BundleBookingModel.findByIdAndUpdate(
            bundleBookingId,
            { $set: { [reviewedField]: true } },
            { new: true, session: dbSession },
          );
        }

        const stats = await ReviewRepository.aggregateTargetUserStats(
          targetUserId,
          dbSession,
        );

        averageRating = stats[0]?.averageRating || 0;
        totalReviews = stats[0]?.totalReviews || 0;

        await UserModel.findByIdAndUpdate(
          targetUserId,
          { $set: { averageRating, totalReviews } },
          { session: dbSession },
        );

        const reviewer = await UserModel.findById(actorUserId)
          .select("firstName lastName")
          .session(dbSession);

        reviewerName = reviewer
          ? `${reviewer.firstName} ${reviewer.lastName}`
          : "Someone";

        bothReviewed = Boolean(
          updatedSource?.customerReviewed && updatedSource?.supplierReviewed,
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
        orderId: orderId || null,
        bundleBookingId: bundleBookingId || null,
        rating,
        comment,
      },
    });

    if (bothReviewed && customerId && supplierId) {
      const refData = orderId ? { orderId } : { bundleBookingId };
      await Promise.all([
        publishNotification({
          userId: customerId,
          type: REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
          title: "All Reviews Submitted",
          message: "Both you and the supplier have submitted your reviews.",
          data: refData,
        }),
        publishNotification({
          userId: supplierId,
          type: REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
          title: "All Reviews Submitted",
          message: "Both you and the customer have submitted your reviews.",
          data: refData,
        }),
      ]);
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
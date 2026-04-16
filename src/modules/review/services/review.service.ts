import prisma from "../../../shared/config/prisma";
import { OrderStatus, BundleBookingStatus } from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { ReviewRepository } from "../repositories/review.repository";
import {
  REVIEW_NOTIFICATION_TYPES,
  REVIEW_ROLES,
} from "../../../shared/constants/review.constants";
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
    if (![REVIEW_ROLES.CUSTOMER, REVIEW_ROLES.SUPPLIER].includes(role as any)) {
      throw new AppError("Invalid review role", 400);
    }

    const referenceId = (orderId || bundleBookingId)!;

    const result = await prisma.$transaction(async (tx) => {
      let customerId: string;
      let supplierId: string;
      let sessionRow: { id: string } | null = null;
      let bothReviewed = false;

      if (orderId) {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new AppError("Order not found", 404);
        sessionRow = await tx.jobSession.findFirst({
          where: { orderId },
          select: { id: true },
        });
        if (!sessionRow) throw new AppError("Session not found for this order", 404);
        if (order.status !== OrderStatus.completed) {
          throw new AppError("Reviews can only be submitted after completion", 400);
        }
        customerId = order.customerId;
        supplierId = (await tx.jobSession.findUnique({
          where: { id: sessionRow.id },
        }))!.supplierId;
      } else {
        const booking = await tx.bundleBooking.findUnique({
          where: { id: bundleBookingId! },
        });
        if (!booking) throw new AppError("Booking not found", 404);
        sessionRow = await tx.jobSession.findFirst({
          where: { bundleBookingId },
          select: { id: true },
        });
        if (!sessionRow) throw new AppError("Session not found for this booking", 404);
        if (booking.status !== BundleBookingStatus.completed) {
          throw new AppError("Reviews can only be submitted after completion", 400);
        }
        customerId = booking.customerId;
        supplierId = booking.supplierId;
      }

      const isCustomerReviewer = role === REVIEW_ROLES.CUSTOMER;
      const isSupplierReviewer = role === REVIEW_ROLES.SUPPLIER;

      if (isCustomerReviewer && actorUserId !== customerId) {
        throw new AppError("Only the customer can submit a customer review", 403);
      }
      if (isSupplierReviewer && actorUserId !== supplierId) {
        throw new AppError("Only the supplier can submit a supplier review", 403);
      }

      // Re-fetch to read current review flags inside the tx
      const source: any = orderId
        ? await tx.order.findUnique({ where: { id: orderId } })
        : await tx.bundleBooking.findUnique({ where: { id: bundleBookingId! } });

      if (isCustomerReviewer && source.customerReviewed) {
        throw new AppError("Customer has already reviewed", 400);
      }
      if (isSupplierReviewer && source.supplierReviewed) {
        throw new AppError("Supplier has already reviewed", 400);
      }

      const targetUserId = isCustomerReviewer ? supplierId : customerId;
      if (actorUserId === targetUserId) {
        throw new AppError("You cannot review yourself", 400);
      }

      const existing = await ReviewRepository.findByReviewerAndOrder(
        actorUserId,
        referenceId,
        tx,
      );
      if (existing) throw new AppError("You have already submitted a review", 400);

      const createdReview = await ReviewRepository.create(
        {
          reviewerId: actorUserId,
          targetUserId,
          orderId: orderId || referenceId,
          sessionId: sessionRow.id,
          rating,
          comment,
        },
        tx,
      );

      const reviewedField = isCustomerReviewer ? "customerReviewed" : "supplierReviewed";

      let updatedSource: any;
      if (orderId) {
        updatedSource = await tx.order.update({
          where: { id: orderId },
          data: { [reviewedField]: true },
        });
      } else {
        updatedSource = await tx.bundleBooking.update({
          where: { id: bundleBookingId! },
          data: { [reviewedField]: true },
        });
      }

      const stats = await ReviewRepository.aggregateTargetUserStats(targetUserId, tx);
      const averageRating = Number(stats.averageRating) || 0;
      const totalReviews = stats.totalReviews || 0;

      await tx.user.update({
        where: { id: targetUserId },
        data: { averageRating, totalReviews },
      });

      const reviewer = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { firstName: true, lastName: true },
      });
      const reviewerName = reviewer
        ? `${reviewer.firstName} ${reviewer.lastName}`
        : "Someone";

      bothReviewed = Boolean(
        updatedSource?.customerReviewed && updatedSource?.supplierReviewed,
      );

      return {
        createdReview,
        targetUserId,
        reviewerName,
        averageRating,
        totalReviews,
        customerId,
        supplierId,
        bothReviewed,
      };
    });

    await publishNotification({
      userId: result.targetUserId,
      type: REVIEW_NOTIFICATION_TYPES.NEW_REVIEW,
      title: "New Review Received",
      message: `${result.reviewerName} left you a ${rating}-star review.`,
      data: {
        reviewId: result.createdReview.id,
        reviewerId: actorUserId,
        orderId: orderId || null,
        bundleBookingId: bundleBookingId || null,
        rating,
        comment,
      },
    });

    if (result.bothReviewed && result.customerId && result.supplierId) {
      const refData = orderId ? { orderId } : { bundleBookingId };
      await Promise.all([
        publishNotification({
          userId: result.customerId,
          type: REVIEW_NOTIFICATION_TYPES.REVIEWS_COMPLETE,
          title: "All Reviews Submitted",
          message: "Both you and the supplier have submitted your reviews.",
          data: refData,
        }),
        publishNotification({
          userId: result.supplierId,
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
        ...result.createdReview,
        targetUserRating: {
          averageRating: result.averageRating,
          totalReviews: result.totalReviews,
        },
      },
    };
  }

  static async getReviewById(reviewId: string) {
    const review = await ReviewRepository.findById(reviewId);
    if (!review) throw new AppError("Review not found", 404);
    return { success: true, review };
  }

  static async getOrderReviews(orderId: string) {
    const reviews = await ReviewRepository.findByOrderId(orderId);
    return { success: true, count: reviews.length, reviews };
  }

  static async getUserReviews(userId: string, page = 1, limit = 10) {
    const [reviews, total] = await Promise.all([
      ReviewRepository.findByTargetUserId(userId, page, limit),
      ReviewRepository.countByTargetUserId(userId),
    ]);
    return { success: true, count: reviews.length, total, page, limit, reviews };
  }
}

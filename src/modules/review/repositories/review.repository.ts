import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const reviewerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
} as const;

const targetSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  averageRating: true,
  totalReviews: true,
} as const;

export class ReviewRepository {
  static create(
    data: {
      reviewerId: string;
      targetUserId: string;
      orderId: string;
      sessionId?: string | null;
      rating: number;
      comment: string;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).review.create({
      data: {
        reviewerId: data.reviewerId,
        targetUserId: data.targetUserId,
        orderId: data.orderId,
        sessionId: data.sessionId ?? null,
        rating: data.rating,
        comment: data.comment,
      },
    });
  }

  static findByReviewerAndOrder(
    reviewerId: string,
    orderId: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).review.findUnique({
      where: { reviewerId_orderId: { reviewerId, orderId } },
    });
  }

  static findById(reviewId: string) {
    return prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        reviewer: { select: reviewerSelect },
        target: { select: targetSelect },
      },
    });
  }

  static findByOrderId(orderId: string) {
    return prisma.review.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: {
        reviewer: { select: reviewerSelect },
        target: { select: reviewerSelect },
      },
    });
  }

  static findByTargetUserId(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    return prisma.review.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        reviewer: { select: reviewerSelect },
      },
    });
  }

  static countByTargetUserId(userId: string) {
    return prisma.review.count({ where: { targetUserId: userId } });
  }

  static async aggregateTargetUserStats(targetUserId: string, tx?: Tx) {
    const result = await (tx ?? prisma).review.aggregate({
      where: { targetUserId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return {
      averageRating: result._avg.rating ?? 0,
      totalReviews: result._count._all,
    };
  }
}

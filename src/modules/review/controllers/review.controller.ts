import { Request, Response } from "express";
import Review from "../models/review.model";
import { publishNotification } from "../../notification/notification.publisher";
import UserModel from "../../auth/models/User.model";
import sessionModel from "../../session/models/session.model";
import OrderModel from "../../order/models/Order.model";

export const createReview = async (req: Request, res: Response) => {
  try {
    const { reviewerId, targetUserId, rating, comment, orderId, role } = req.body;

    if (reviewerId === targetUserId) {
      return res.status(400).json({ message: "You cannot review yourself" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const existingReview = await Review.findOne({
      reviewerId,
      orderId,
    });

    if (existingReview) {
      return res.status(400).json({ 
        message: "You have already reviewed this order" 
      });
    }

    const review = await Review.create({
      reviewerId,
      targetUserId,
      rating,
      comment,
    });

    await OrderModel.findByIdAndUpdate(orderId, {
      [`${role}Reviewed`]: true,
    });

    const reviews = await Review.find({ targetUserId });

    const totalReviews = reviews.length;
    const averageRating = reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews;

    const targetUser = await UserModel.findById(targetUserId);
    
    if (targetUser) {
      targetUser.averageRating = averageRating;
      targetUser.totalReviews = totalReviews;
      
      const reviewer = await UserModel.findById(reviewerId);
      targetUser.reviews?.push({
        reviewerId: reviewerId,
        reviewerName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Unknown",
        rating,
        comment,
        createdAt: new Date(),
      });

      await targetUser.save();
    }

    const order = await OrderModel.findById(orderId);
    const session = await sessionModel.findOne({ orderId });

    const reviewer = await UserModel.findById(reviewerId);
    const reviewerName = reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Someone";

    await publishNotification({
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
        await publishNotification({
          userId: order.customerId.toString(),
          type: "REVIEWS_COMPLETE",
          title: "All Reviews Submitted",
          message: `Both you and the supplier have reviewed order #${orderId}.`,
          data: {
            orderId: orderId.toString(),
          },
        });

        await publishNotification({
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
  } catch (error) {
    console.error("Create review error:", error);
    res.status(500).json({ message: "Failed to create review" });
  }
};
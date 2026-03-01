import { Request, Response } from "express";
import Review from "../models/review.model";

export const createReview = async (req: Request, res: Response) => {
  const { reviewerId, targetUserId, rating, comment, orderId, role } = req.body;

  if (reviewerId === targetUserId) {
    return res.status(400).json({ message: "You cannot review yourself" });
  }

  const review = await Review.create({
    reviewerId,
    targetUserId,
    rating,
    comment,
  });

  const orderResponse = await axios.patch(
    `${process.env.ORDER_SERVICE_URL}/api/orders/${orderId}/review`,
    {
      role
    },
    {
      headers: {
        Authorization: req.headers.authorization!,
      },
    }
  );

  const reviews = await Review.find({ targetUserId });

  const totalReviews = reviews.length;
  const averageRating =
    reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews;

  await axios.patch(
    `${process.env.AUTH_SERVICE_URL}/api/auth/${targetUserId}/update-rating`,
    {
      averageRating,
      totalReviews,
      review
    }
  );

  res.status(201).json(review);
};
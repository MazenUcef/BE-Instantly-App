import { Request, Response } from "express";
import { ReviewService } from "../services/review.service";

export const createReview = async (req: any, res: Response) => {
  const result = await ReviewService.createReview({
    actorUserId: req.user.userId,
    orderId: req.body.orderId,
    bundleBookingId: req.body.bundleBookingId,
    rating: req.body.rating,
    comment: req.body.comment,
    role: req.body.role,
  });

  return res.status(201).json(result);
};

export const getReviewById = async (req: Request, res: Response) => {
  const result = await ReviewService.getReviewById(req.params.id as string);
  return res.status(200).json(result);
};

export const getOrderReviews = async (req: Request, res: Response) => {
  const result = await ReviewService.getOrderReviews(req.params.orderId as string);
  return res.status(200).json(result);
};

export const getUserReviews = async (req: Request, res: Response) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);

  const result = await ReviewService.getUserReviews(
    req.params.userId as string,
    page,
    limit,
  );

  return res.status(200).json(result);
};
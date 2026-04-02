import { Router } from "express";
import {
  createReview,
  getReviewById,
  getOrderReviews,
  getUserReviews,
} from "../controllers/review.controller";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  validateCreateReview,
  validateGetReviewById,
  validateGetOrderReviews,
  validateGetUserReviews,
} from "../validators/review.validation";

const router = Router();

router.post("/", authenticate, validateCreateReview, createReview);
router.get("/:id", validateGetReviewById, getReviewById);
router.get("/order/:orderId", validateGetOrderReviews, getOrderReviews);
router.get("/user/:userId", authenticate, validateGetUserReviews, getUserReviews);

export default router;
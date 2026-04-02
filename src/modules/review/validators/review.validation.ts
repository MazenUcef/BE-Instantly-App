import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import { REVIEW_ROLES } from "../../../shared/constants/review.constants";

export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  next();
};

export const validateCreateReview: RequestHandler[] = [
  body("orderId")
    .notEmpty()
    .withMessage("Order ID is required")
    .bail()
    .isMongoId()
    .withMessage("Invalid order ID"),

  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .bail()
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be an integer between 1 and 5")
    .toInt(),

  body("comment")
    .notEmpty()
    .withMessage("Comment is required")
    .bail()
    .isString()
    .withMessage("Comment must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 1000 })
    .withMessage("Comment must be between 2 and 1000 characters"),

  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .bail()
    .isIn([REVIEW_ROLES.CUSTOMER, REVIEW_ROLES.SUPPLIER])
    .withMessage("Role must be either customer or supplier"),

  handleValidationErrors,
];

export const validateGetReviewById: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid review ID"),
  handleValidationErrors,
];

export const validateGetOrderReviews: RequestHandler[] = [
  param("orderId").isMongoId().withMessage("Invalid order ID"),
  handleValidationErrors,
];

export const validateGetUserReviews: RequestHandler[] = [
  param("userId").isMongoId().withMessage("Invalid user ID"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  handleValidationErrors,
];
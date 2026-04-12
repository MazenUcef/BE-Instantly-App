import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";

const handleValidationErrors = (
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

export const validateCreateOffer: RequestHandler[] = [
  body("orderId")
    .notEmpty()
    .isMongoId()
    .withMessage("Valid orderId is required"),
  body("amount")
    .notEmpty()
    .isFloat({ min: 1 })
    .withMessage("amount must be >= 1"),
  body("estimatedDuration")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("estimatedDuration must be an integer >= 1 minute"),
  body("numberOfDays")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("numberOfDays must be an integer >= 1"),
  body("timeToStart")
    .notEmpty()
    .withMessage("timeToStart is required")
    .bail()
    .isISO8601()
    .withMessage("timeToStart must be a valid ISO date"),
  handleValidationErrors,
];

export const validateAcceptOrderDirect: RequestHandler[] = [
  param("orderId").isMongoId().withMessage("Invalid order id"),
  handleValidationErrors,
];

export const validateOfferIdParam: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid offer id"),
  handleValidationErrors,
];

export const validateOrderIdParam: RequestHandler[] = [
  param("orderId").isMongoId().withMessage("Invalid order id"),
  handleValidationErrors,
];

export const validateOfferHistoryQuery: RequestHandler[] = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
];

import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import { ORDER_TYPE } from "../../../shared/constants/order.constants";

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

export const validateCreateOrder: RequestHandler[] = [
  body("address").notEmpty().isString().trim().isLength({ min: 3, max: 500 }),
  body("description").notEmpty().isString().trim().isLength({ min: 3, max: 5000 }),
  body("categoryId").notEmpty().isMongoId().withMessage("Valid categoryId is required"),
  body("governmentId").notEmpty().isMongoId().withMessage("Valid governmentId is required"),
  body("jobTitle").notEmpty().isString().trim().isLength({ min: 1, max: 200 }),
  body("requestedPrice").notEmpty().isFloat({ min: 1 }).withMessage("requestedPrice must be >= 1"),
  body("orderType")
    .notEmpty()
    .isIn(Object.values(ORDER_TYPE))
    .withMessage("Invalid orderType"),
  body("timeToStart")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("timeToStart must be a valid ISO date"),
  handleValidationErrors,
];

export const validateOrderIdParam: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid order id"),
  handleValidationErrors,
];

export const validateUpdateOrderPrice: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid order id"),
  body("requestedPrice").notEmpty().isFloat({ min: 1 }).withMessage("requestedPrice must be >= 1"),
  handleValidationErrors,
];

export const validateOrderHistoryQuery: RequestHandler[] = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
];
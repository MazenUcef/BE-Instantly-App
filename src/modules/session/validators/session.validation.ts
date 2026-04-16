import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, validationResult } from "express-validator";

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

export const validateCreateSession: RequestHandler[] = [
  body("orderId").notEmpty().isUUID().withMessage("Valid orderId is required"),
  body("offerId").notEmpty().isUUID().withMessage("Valid offerId is required"),
  body("customerId").notEmpty().isUUID().withMessage("Valid customerId is required"),
  body("supplierId").notEmpty().isUUID().withMessage("Valid supplierId is required"),
  handleValidationErrors,
];

export const validateSessionIdParam: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid session id"),
  handleValidationErrors,
];

export const validateSessionPaymentParam: RequestHandler[] = [
  param("sessionId").isUUID().withMessage("Invalid session id"),
  handleValidationErrors,
];

export const validateOrderIdParam: RequestHandler[] = [
  param("orderId").isUUID().withMessage("Invalid order id"),
  handleValidationErrors,
];

export const validateUserIdParam: RequestHandler[] = [
  param("userId").isUUID().withMessage("Invalid user id"),
  handleValidationErrors,
];

export const validateUpdateSessionStatus: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid session id"),
  body("status")
    .notEmpty()
    .withMessage("status is required")
    .bail()
    .isString()
    .withMessage("status must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("status must be between 2 and 50 characters"),
  body("reason")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Invalid reason"),
  handleValidationErrors,
];
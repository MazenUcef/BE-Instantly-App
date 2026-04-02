import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, validationResult } from "express-validator";
import { SESSION_STATUS } from "../../../shared/constants/session.constants";

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
  body("orderId").notEmpty().isMongoId().withMessage("Valid orderId is required"),
  body("offerId").notEmpty().isMongoId().withMessage("Valid offerId is required"),
  body("customerId").notEmpty().isMongoId().withMessage("Valid customerId is required"),
  body("supplierId").notEmpty().isMongoId().withMessage("Valid supplierId is required"),
  handleValidationErrors,
];

export const validateSessionIdParam: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid session id"),
  handleValidationErrors,
];

export const validateSessionPaymentParam: RequestHandler[] = [
  param("sessionId").isMongoId().withMessage("Invalid session id"),
  handleValidationErrors,
];

export const validateOrderIdParam: RequestHandler[] = [
  param("orderId").isMongoId().withMessage("Invalid order id"),
  handleValidationErrors,
];

export const validateUserIdParam: RequestHandler[] = [
  param("userId").isMongoId().withMessage("Invalid user id"),
  handleValidationErrors,
];

export const validateUpdateSessionStatus: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid session id"),
  body("status")
    .notEmpty()
    .isIn([
      SESSION_STATUS.ON_THE_WAY,
      SESSION_STATUS.ARRIVED,
      SESSION_STATUS.WORK_STARTED,
      SESSION_STATUS.CANCELLED,
    ])
    .withMessage("Invalid status"),
  body("reason")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Invalid reason"),
  handleValidationErrors,
];
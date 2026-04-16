import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";

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

export const validateSendMessage: RequestHandler[] = [
  body("sessionId")
    .notEmpty()
    .withMessage("Session ID is required")
    .bail()
    .isUUID()
    .withMessage("Invalid session ID"),

  body("message")
    .notEmpty()
    .withMessage("Message is required")
    .bail()
    .isString()
    .withMessage("Message must be a string")
    .bail()
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage("Message must be between 1 and 5000 characters"),

  handleValidationErrors,
];

export const validateGetMessagesBySession: RequestHandler[] = [
  param("sessionId").isUUID().withMessage("Invalid session ID"),

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

export const validateMarkMessagesAsRead: RequestHandler[] = [
  param("sessionId").isUUID().withMessage("Invalid session ID"),
  handleValidationErrors,
];
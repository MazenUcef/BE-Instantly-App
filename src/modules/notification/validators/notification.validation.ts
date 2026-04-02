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

export const validateCreateNotification: RequestHandler[] = [
  body("userId").notEmpty().isMongoId().withMessage("Valid userId is required"),
  body("type").notEmpty().isString().trim().isLength({ min: 1, max: 100 }),
  body("title").notEmpty().isString().trim().isLength({ min: 1, max: 200 }),
  body("message").notEmpty().isString().trim().isLength({ min: 1, max: 2000 }),
  body("data").optional().isObject().withMessage("data must be an object"),
  handleValidationErrors,
];

export const validateNotificationIdParam: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid notification id"),
  handleValidationErrors,
];

export const validateNotificationListQuery: RequestHandler[] = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
];
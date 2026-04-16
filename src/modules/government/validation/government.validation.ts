import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, validationResult } from "express-validator";

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

export const validateCreateGovernment: RequestHandler[] = [
  body("name")
    .notEmpty()
    .withMessage("Government name is required")
    .bail()
    .isString()
    .withMessage("Government name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Government name must be between 2 and 100 characters"),

  body("nameAr")
    .notEmpty()
    .withMessage("Government Arabic name is required")
    .bail()
    .isString()
    .withMessage("Government Arabic name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Government Arabic name must be between 2 and 100 characters"),

  body("country")
    .optional()
    .isString()
    .withMessage("Country must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Country must be between 2 and 100 characters"),

  body("order")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Order must be a non-negative integer")
    .toInt(),

  handleValidationErrors,
];

export const validateGetGovernmentById: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid government ID"),
  handleValidationErrors,
];

export const validateUpdateGovernment: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid government ID"),

  body("name")
    .optional()
    .isString()
    .withMessage("Government name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Government name must be between 2 and 100 characters"),

  body("nameAr")
    .optional()
    .isString()
    .withMessage("Government Arabic name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Government Arabic name must be between 2 and 100 characters"),

  body("country")
    .optional()
    .isString()
    .withMessage("Country must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Country must be between 2 and 100 characters"),

  body("order")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Order must be a non-negative integer")
    .toInt(),

  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean")
    .toBoolean(),

  handleValidationErrors,
];

export const validateDeleteGovernment: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid government ID"),
  handleValidationErrors,
];

export const validateToggleGovernmentStatus: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid government ID"),
  handleValidationErrors,
];
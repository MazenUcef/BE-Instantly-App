import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";

const ADDRESS_TYPES = ["home", "work", "favorite", "other"] as const;

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

export const validateCreateAddress: RequestHandler[] = [
  body("type")
    .notEmpty()
    .withMessage("Address type is required")
    .bail()
    .isIn(ADDRESS_TYPES)
    .withMessage(`Address type must be one of: ${ADDRESS_TYPES.join(", ")}`),

  body("address")
    .notEmpty()
    .withMessage("Address is required")
    .bail()
    .isString()
    .withMessage("Address must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 500 })
    .withMessage("Address must be between 2 and 500 characters"),

  body("label")
    .optional({ nullable: true })
    .isString()
    .withMessage("Label must be a string")
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Label cannot exceed 100 characters"),

  body("latitude")
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a number between -90 and 90"),

  body("longitude")
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a number between -180 and 180"),

  handleValidationErrors,
];

export const validateListAddresses: RequestHandler[] = [
  query("type")
    .optional()
    .isIn(ADDRESS_TYPES)
    .withMessage(`type must be one of: ${ADDRESS_TYPES.join(", ")}`),
  handleValidationErrors,
];

export const validateAddressIdParam: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid address ID"),
  handleValidationErrors,
];

export const validateUpdateAddress: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid address ID"),

  body("type")
    .optional()
    .isIn(ADDRESS_TYPES)
    .withMessage(`Address type must be one of: ${ADDRESS_TYPES.join(", ")}`),

  body("address")
    .optional()
    .isString()
    .withMessage("Address must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 500 })
    .withMessage("Address must be between 2 and 500 characters"),

  body("label")
    .optional({ nullable: true })
    .isString()
    .withMessage("Label must be a string")
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Label cannot exceed 100 characters"),

  body("latitude")
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude must be a number between -90 and 90"),

  body("longitude")
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude must be a number between -180 and 180"),

  handleValidationErrors,
];

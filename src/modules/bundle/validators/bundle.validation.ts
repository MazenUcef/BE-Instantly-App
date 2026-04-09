import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import { BUNDLE_ALLOWED_DURATIONS } from "../../../shared/constants/bundle.constants";

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

export const validateCreateBundle: RequestHandler[] = [
  body("categoryId")
    .optional()
    .isMongoId()
    .withMessage("categoryId must be a valid MongoId"),
  body("governmentIds")
    .optional()
    .isArray({ min: 1 })
    .withMessage("governmentIds must be a non-empty array"),
  body("governmentIds.*")
    .optional()
    .isMongoId()
    .withMessage("Each governmentId must be valid"),
  body("title").notEmpty().isString().trim().isLength({ min: 1, max: 200 }),
  body("subtitle")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 250 }),
  body("description")
    .notEmpty()
    .isString()
    .trim()
    .isLength({ min: 1, max: 4000 }),
  body("image")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 }),
  body("price")
    .notEmpty()
    .isFloat({ min: 1 })
    .withMessage("price must be >= 1"),
  body("oldPrice").optional({ nullable: true }).isFloat({ min: 1 }),
  body("durationMinutes")
    .notEmpty()
    .isInt()
    .custom((value) => BUNDLE_ALLOWED_DURATIONS.includes(Number(value) as any))
    .withMessage("Invalid durationMinutes"),
  body("selectedWorkflow")
    .notEmpty()
    .withMessage("selectedWorkflow is required")
    .bail()
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("selectedWorkflow must be between 2 and 50 characters"),
  body("includes").optional().isArray(),
  body("includes.*")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 }),
  body("tags").optional().isArray(),
  body("tags.*").optional().isString().trim().isLength({ min: 1, max: 100 }),
  handleValidationErrors,
];

export const validateUpdateBundle: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid bundle id"),
  body("categoryId").optional().isMongoId(),
  body("governmentIds").optional().isArray({ min: 1 }),
  body("governmentIds.*").optional().isMongoId(),
  body("title").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("subtitle")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 250 }),
  body("description")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 4000 }),
  body("image")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 }),
  body("price").optional().isFloat({ min: 1 }),
  body("oldPrice").optional({ nullable: true }).isFloat({ min: 1 }),
  body("durationMinutes")
    .optional()
    .isInt()
    .custom((value) => BUNDLE_ALLOWED_DURATIONS.includes(Number(value) as any))
    .withMessage("Invalid durationMinutes"),
  body("selectedWorkflow")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 2, max: 50 }),
  body("includes").optional().isArray(),
  body("includes.*")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 }),
  body("tags").optional().isArray(),
  body("tags.*").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("isActive").optional().isBoolean(),
  handleValidationErrors,
];

export const validateBundleIdParam: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid bundle id"),
  handleValidationErrors,
];

export const validateGetBundlesQuery: RequestHandler[] = [
  query("categoryId").optional().isMongoId(),
  query("governmentId").optional().isMongoId(),
  query("supplierId").optional().isMongoId(),
  handleValidationErrors,
];

import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, validationResult } from "express-validator";
import upload from "../../../shared/config/multer";

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

const parseJobsIfNeeded: RequestHandler = (req, _res, next) => {
  if (typeof req.body.jobs === "string") {
    try {
      req.body.jobs = JSON.parse(req.body.jobs);
    } catch {
      // leave as-is, validator will fail
    }
  }
  next();
};

const parseWorkflowsIfNeeded: RequestHandler = (req, _res, next) => {
  if (typeof req.body.workflows === "string") {
    try {
      req.body.workflows = JSON.parse(req.body.workflows);
    } catch {
      // leave as-is, validator will fail
    }
  }
  next();
};

const workflowValidationRules = () => [
  body("workflows")
    .optional()
    .isArray()
    .withMessage("workflows must be an array"),

  body("workflows.*.key")
    .isString()
    .withMessage("Workflow key must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Workflow key cannot be empty")
    .bail()
    .isLength({ min: 2, max: 50 })
    .withMessage("Workflow key must be between 2 and 50 characters"),

  body("workflows.*.label")
    .isString()
    .withMessage("Workflow label must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Workflow label cannot be empty")
    .bail()
    .isLength({ min: 2, max: 100 })
    .withMessage("Workflow label must be between 2 and 100 characters"),

  body("workflows.*.steps")
    .isArray({ min: 1 })
    .withMessage("Workflow steps must be a non-empty array"),

  body("workflows.*.steps.*")
    .isString()
    .withMessage("Each workflow step must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Workflow step cannot be empty")
    .bail()
    .isLength({ min: 2, max: 50 })
    .withMessage("Each workflow step must be between 2 and 50 characters"),
];

export const validateCreateCategory: RequestHandler[] = [
  upload.fields([{ name: "image", maxCount: 1 }]),
  parseJobsIfNeeded,
  parseWorkflowsIfNeeded,

  body("name")
    .notEmpty()
    .withMessage("Category name is required")
    .bail()
    .isString()
    .withMessage("Category name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be between 2 and 100 characters"),

  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("Description must be a string")
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description cannot exceed 1000 characters"),

  body("image")
    .optional()
    .isString()
    .withMessage("Image must be a string URL")
    .bail()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Image URL is invalid"),

  body("jobs")
    .optional()
    .isArray()
    .withMessage("Jobs must be an array"),

  body("jobs.*")
    .optional()
    .isString()
    .withMessage("Each job must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Job cannot be empty")
    .bail()
    .isLength({ min: 2, max: 100 })
    .withMessage("Each job must be between 2 and 100 characters"),

  ...workflowValidationRules(),

  handleValidationErrors,
];

export const validateGetCategoryById: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid category ID"),
  handleValidationErrors,
];

export const validateUpdateCategory: RequestHandler[] = [
  upload.fields([{ name: "image", maxCount: 1 }]),
  parseJobsIfNeeded,
  parseWorkflowsIfNeeded,

  param("id").isUUID().withMessage("Invalid category ID"),

  body("name")
    .optional()
    .isString()
    .withMessage("Category name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Category name must be between 2 and 100 characters"),

  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("Description must be a string")
    .bail()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Description cannot exceed 1000 characters"),

  body("image")
    .optional()
    .isString()
    .withMessage("Image must be a string URL")
    .bail()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Image URL is invalid"),

  body("jobs")
    .optional()
    .isArray()
    .withMessage("Jobs must be an array"),

  body("jobs.*")
    .optional()
    .isString()
    .withMessage("Each job must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Job cannot be empty")
    .bail()
    .isLength({ min: 2, max: 100 })
    .withMessage("Each job must be between 2 and 100 characters"),

  ...workflowValidationRules(),

  handleValidationErrors,
];

export const validateDeleteCategory: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid category ID"),
  handleValidationErrors,
];
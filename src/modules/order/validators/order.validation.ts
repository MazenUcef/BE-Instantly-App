import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import { ORDER_TYPE } from "../../../shared/constants/order.constants";
import { uploadWithFiles } from "../../../shared/config/multer";

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
  uploadWithFiles.fields([
    { name: "images", maxCount: 5 },
    { name: "files", maxCount: 3 },
  ]),
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
  body("selectedWorkflow")
    .notEmpty()
    .isString()
    .withMessage("selectedWorkflow is required")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("selectedWorkflow must be between 2 and 50 characters"),
  body("timeToStart")
    .notEmpty()
    .withMessage("timeToStart is required")
    .bail()
    .isISO8601()
    .withMessage("timeToStart must be a valid ISO date"),
  body("expectedDays")
    .if(body("orderType").equals(ORDER_TYPE.DAILY))
    .notEmpty()
    .withMessage("expectedDays is required for daily orders")
    .bail()
    .isInt({ min: 1, max: 365 })
    .withMessage("expectedDays must be an integer between 1 and 365")
    .toInt(),
  body("expectedDays")
    .if(body("orderType").equals(ORDER_TYPE.CONTRACT))
    .not()
    .exists()
    .withMessage("expectedDays is not allowed for contract orders"),
  body("estimatedDuration")
    .if(body("orderType").equals(ORDER_TYPE.CONTRACT))
    .notEmpty()
    .withMessage("estimatedDuration is required for contract orders")
    .bail()
    .isInt({ min: 1 })
    .withMessage("estimatedDuration must be an integer >= 1 minute")
    .toInt(),
  body("estimatedDuration")
    .if(body("orderType").equals(ORDER_TYPE.DAILY))
    .not()
    .exists()
    .withMessage("estimatedDuration is not allowed for daily orders"),
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
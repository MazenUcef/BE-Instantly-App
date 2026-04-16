import { Request, Response, NextFunction, RequestHandler } from "express";
import { param, query, validationResult } from "express-validator";

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

export const validateSupplierCalendarQuery: RequestHandler[] = [
  param("supplierId").isUUID().withMessage("Invalid supplierId"),
  query("month")
    .notEmpty()
    .withMessage("month query is required")
    .bail()
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage("month must be in YYYY-MM format"),
  handleValidationErrors,
];

export const validateSupplierBookedTimesQuery: RequestHandler[] = [
  param("supplierId").isUUID().withMessage("Invalid supplierId"),
  query("date")
    .notEmpty()
    .isISO8601()
    .withMessage("date query is required and must be valid"),
  handleValidationErrors,
];

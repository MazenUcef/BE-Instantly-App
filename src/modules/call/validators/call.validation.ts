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

export const validateStartCall: RequestHandler[] = [
  body("sessionId")
    .notEmpty()
    .isMongoId()
    .withMessage("Valid sessionId is required"),
  handleValidationErrors,
];

export const validateCallIdParam: RequestHandler[] = [
  param("id").isMongoId().withMessage("Invalid call id"),
  handleValidationErrors,
];

export const validateSessionIdParam: RequestHandler[] = [
  param("sessionId").isMongoId().withMessage("Invalid session id"),
  handleValidationErrors,
];

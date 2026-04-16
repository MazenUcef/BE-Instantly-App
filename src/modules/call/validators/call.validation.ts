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
    .isUUID()
    .withMessage("Valid sessionId is required"),
  body("type")
    .optional()
    .isIn(["audio", "video"])
    .withMessage("type must be 'audio' or 'video'"),
  handleValidationErrors,
];

export const validateCallIdParam: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid call id"),
  handleValidationErrors,
];

export const validateSessionIdParam: RequestHandler[] = [
  param("sessionId").isUUID().withMessage("Invalid session id"),
  handleValidationErrors,
];

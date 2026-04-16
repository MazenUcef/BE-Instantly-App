import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

export const validateCreateBundleBooking: RequestHandler[] = [
  body("bundleId")
    .notEmpty()
    .isUUID()
    .withMessage("Valid bundleId is required"),
  body("governmentId")
    .notEmpty()
    .isUUID()
    .withMessage("Valid governmentId is required"),
  body("address").notEmpty().isString().trim().isLength({ min: 3, max: 500 }),
  body("notes")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 }),
  body("bookedDate")
    .notEmpty()
    .isISO8601()
    .withMessage("bookedDate must be valid"),
  body("slotStart")
    .notEmpty()
    .matches(TIME_REGEX)
    .withMessage("slotStart must be HH:mm"),
  body("slotEnd")
    .notEmpty()
    .matches(TIME_REGEX)
    .withMessage("slotEnd must be HH:mm"),
  body("scheduledAt")
    .notEmpty()
    .isISO8601()
    .withMessage("scheduledAt must be valid"),
  handleValidationErrors,
];

export const validateBookingIdParam: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid booking id"),
  handleValidationErrors,
];

export const validateRejectBooking: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid booking id"),
  body("rejectionReason")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 }),
  handleValidationErrors,
];

export const validateProposeTime: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid booking id"),
  body("proposedBookedDate")
    .notEmpty()
    .isISO8601()
    .withMessage("proposedBookedDate must be valid"),
  body("proposedSlotStart")
    .notEmpty()
    .matches(TIME_REGEX)
    .withMessage("proposedSlotStart must be HH:mm"),
  body("proposedSlotEnd")
    .notEmpty()
    .matches(TIME_REGEX)
    .withMessage("proposedSlotEnd must be HH:mm"),
  body("proposedScheduledAt")
    .notEmpty()
    .isISO8601()
    .withMessage("proposedScheduledAt must be valid"),
  handleValidationErrors,
];

export const validateBookingStatusQuery: RequestHandler[] = [
  query("status").optional().isString().trim(),
  handleValidationErrors,
];
